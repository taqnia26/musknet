import { useEffect, useState } from 'react';

const logoSrc = `${import.meta.env.BASE_URL}site-assets/admin-logo.png`;

export function SiteIntro() {
  const [isVisible, setIsVisible] = useState(true);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setIsLeaving(true), 1350);
    const removeTimer = window.setTimeout(() => setIsVisible(false), 1900);

    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className={`site-intro ${isLeaving ? 'site-intro--leaving' : ''}`}
      role="status"
      aria-label="Musk Ellolo"
    >
      <img src={logoSrc} alt="Musk Ellolo" className="site-intro__logo" />
    </div>
  );
}