import { useEffect, useRef } from "react";

// 原生 <dialog>：Esc 與點背景皆可關閉
export default function Dialog({ title, onClose, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`info-dialog${wide ? " wide" : ""}`}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current.close()}
    >
      <div className="dialog-header">
        <h3>{title}</h3>
        <button type="button" aria-label="關閉" onClick={() => ref.current.close()}>✕</button>
      </div>
      <div className="dialog-content">{children}</div>
    </dialog>
  );
}
