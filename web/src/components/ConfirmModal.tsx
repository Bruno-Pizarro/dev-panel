import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmación explícita para acciones destructivas (el servidor además exige `confirm: true`). */
export const ConfirmModal = ({ open, title, children, confirmLabel, danger, loading, onConfirm, onCancel }: ConfirmModalProps) => (
  <Modal
    open={open}
    title={title}
    onClose={onCancel}
    footer={
      <>
        <Button onClick={onCancel}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <div className="text-muted">{children}</div>
  </Modal>
);
