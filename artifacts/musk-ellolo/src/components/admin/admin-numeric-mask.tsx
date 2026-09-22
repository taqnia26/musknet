import { useEffect } from 'react';
import { maskNumericString } from '@/hooks/use-admin-numeric-mask';

const isExcluded = (node: Text) => {
  const parent = node.parentElement;
  return !parent || Boolean(parent.closest(
    'script, style, noscript, textarea, input, select, [contenteditable="true"], [data-privacy-mask-ignore="true"]',
  ));
};

export function AdminNumericMask({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const originals = new Map<Text, string>();
    let applying = false;
    const maskNode = (node: Text) => {
      if (isExcluded(node)) return;
      const current = node.data;
      const saved = originals.get(node);
      if (saved !== undefined && current === maskNumericString(saved)) return;
      if (!/[0-9٠-٩۰-۹]/.test(current)) return;
      originals.set(node, current);
      const masked = maskNumericString(current);
      if (masked !== current) node.data = masked;
    };
    const scan = (root: Node) => {
      if (applying) return;
      applying = true;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        maskNode(node as Text);
        node = walker.nextNode();
      }
      applying = false;
    };

    scan(document.body);
    const observer = new MutationObserver((mutations) => {
      if (applying) return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') maskNode(mutation.target as Text);
        mutation.addedNodes.forEach(scan);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    return () => {
      observer.disconnect();
      applying = true;
      originals.forEach((original, node) => {
        if (node.isConnected) node.data = original;
      });
      applying = false;
    };
  }, [enabled]);

  return null;
}