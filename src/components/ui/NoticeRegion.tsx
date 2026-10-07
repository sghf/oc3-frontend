import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const REGION_ID = "notice-region";

/**
 * The area the temporary messages show in: a stack centred at the top of the window,
 * under the top bar, above the page and outside its flow, so that a message
 * arriving or leaving moves nothing. Rendered once, by the application shell; it
 * lets the pointer through, the messages themselves catching it.
 */
export function NoticeRegion() {
  return (
    <div
      id={REGION_ID}
      className="pointer-events-none fixed top-14 left-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col items-center gap-2 [&>*]:pointer-events-auto"
    />
  );
}

/**
 * Shows its content in the area of the temporary messages (NoticeRegion), or in
 * place where there is none, a page shown outside the application shell.
 */
export function InNoticeRegion({ children }: { children: ReactNode }) {
  const [region, setRegion] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setRegion(document.getElementById(REGION_ID));
  }, []);
  return region === null ? children : createPortal(children, region);
}
