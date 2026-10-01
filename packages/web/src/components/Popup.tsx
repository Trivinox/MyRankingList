import { useEffect, useId, useRef } from 'react';
import { InfoIcon, WarningCircleIcon, WarningIcon } from '@phosphor-icons/react';
import styles from './Popup.module.css';

export type Severity = 'info' | 'warning' | 'error';

// Told apart by shape as well as by colour.
const icons = {
  info: InfoIcon,
  warning: WarningIcon,
  error: WarningCircleIcon,
};

interface PopupProps {
  severity: Severity;
  message: string;
  // What the one button says. Escape does the same thing.
  action: string;
  onClose: () => void;
}

export function Popup({ severity, message, action, onClose }: PopupProps) {
  const messageId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const Icon = icons[severity];

  // Modal, so the page behind it goes inert and Escape reaches it. The focus
  // goes to the button, the only thing there is to do. StrictMode runs this
  // twice, and the second time finds it open.
  useEffect(() => {
    const node = dialog.current;
    if (!node || node.open) return;
    node.showModal();
    button.current?.focus();
  }, []);

  // Closed before the handler runs: while it is open the rest of the page is
  // inert, and nothing there could take the focus the handler hands it.
  const close = () => {
    dialog.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className={`${styles.popup} ${styles[severity]}`}
      role="alertdialog"
      aria-labelledby={messageId}
      // Escape. Left to the browser, the dialog would close without the
      // screen behind it knowing.
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <p id={messageId} className={styles.message}>
        {message}
      </p>
      <button ref={button} type="button" className={styles.button} onClick={close}>
        {action}
      </button>
    </dialog>
  );
}
