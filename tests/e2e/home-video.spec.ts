import { expect, test, type Locator, type Page } from "@playwright/test";

declare global {
  interface Window {
    __secondVideoPlayCalls?: number;
  }
}

const secondVideoSelector = 'video[poster*="second-video-poster"]';
const mobileVideoRequest = /\/site-assets\/1-mobile\.(?:webm|mp4)(?:\?|$)/;

async function placeVideoAtRatio(
  page: Page,
  video: Locator,
  ratio: number,
) {
  await video.evaluate((element, targetRatio) => {
    const rect = element.getBoundingClientRect();
    const documentTop = rect.top + window.scrollY;
    const targetTop = window.innerHeight - rect.height * targetRatio;
    window.scrollTo(0, Math.max(0, documentTop - targetTop));
  }, ratio);

  await page.waitForTimeout(500);
}

async function visibleRatio(video: Locator) {
  return video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0),
    );

    return visibleHeight / rect.height;
  });
}

for (const effectiveType of ["2g", "3g"]) {
  test(`lower homepage video waits for 25% visibility on ${effectiveType}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    try {
      await context.addInitScript((connectionType) => {
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: { effectiveType: connectionType, saveData: false },
        });

        window.__secondVideoPlayCalls = 0;
        HTMLMediaElement.prototype.play = function () {
          if (this.querySelector?.('source[src*="1-mobile"]')) {
            window.__secondVideoPlayCalls =
              (window.__secondVideoPlayCalls ?? 0) + 1;
          }

          return Promise.resolve();
        };
      }, effectiveType);

      const page = await context.newPage();
      const videoRequests: string[] = [];
      page.on("request", (request) => {
        if (mobileVideoRequest.test(request.url())) {
          videoRequests.push(request.url());
        }
      });

      await page.goto("/");
      const video = page.locator(secondVideoSelector);
      await expect(video).toBeAttached();
      await page.waitForTimeout(750);

      await expect(video).toHaveAttribute("preload", "none");
      await expect(video).toHaveAttribute(
        "poster",
        /\/site-assets\/second-video-poster\.jpg$/,
      );
      await expect(video.locator("source")).toHaveCount(2);
      await expect(video.locator("source").nth(0)).toHaveAttribute(
        "src",
        /\/site-assets\/1-mobile\.webm$/,
      );
      await expect(video.locator("source").nth(0)).toHaveAttribute(
        "type",
        "video/webm",
      );
      await expect(video.locator("source").nth(1)).toHaveAttribute(
        "src",
        /\/site-assets\/1-mobile\.mp4$/,
      );
      await expect(video.locator("source").nth(1)).toHaveAttribute(
        "type",
        "video/mp4",
      );
      expect(videoRequests).toEqual([]);
      expect(await video.evaluate((element) => element.readyState)).toBe(0);

      await placeVideoAtRatio(page, video, 0.1);
      expect(await visibleRatio(video)).toBeLessThan(0.25);
      expect(videoRequests).toEqual([]);
      expect(await video.evaluate(() => window.__secondVideoPlayCalls)).toBe(0);
      expect(await video.evaluate((element) => element.readyState)).toBe(0);

      await placeVideoAtRatio(page, video, 0.3);
      expect(await visibleRatio(video)).toBeGreaterThanOrEqual(0.25);
      await expect
        .poll(() =>
          video.evaluate(() => window.__secondVideoPlayCalls ?? 0),
        )
        .toBeGreaterThan(0);
      await expect.poll(() => videoRequests.length).toBeGreaterThan(0);
      await expect(video).toHaveAttribute(
        "poster",
        /\/site-assets\/second-video-poster\.jpg$/,
      );
    } finally {
      await context.close();
    }
  });
}