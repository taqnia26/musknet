import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("generated API validator source initialization", () => {
  it("imports the complete source module without relying on bundler hoisting", () => {
    const result = spawnSync(process.execPath, [
      "--import", "tsx", "--input-type=module", "-e",
      'const api = await import("@workspace/api-zod"); if (!api.SubmitDistributorPortalOrderBody || !api.AdminApproveDistributorContractCreditLimitBody || !api.AdminListContractsResponse) throw new Error("Expected validators missing");',
    ], { encoding: "utf8", timeout: 15_000 });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
  });
});