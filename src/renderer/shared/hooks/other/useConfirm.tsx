import { useCallback, useState } from 'react';
import { Confirmation } from '../../components/modals/confirmation';

interface Pending {
  text: string;
  resolve: (confirmed: boolean) => void;
}

export const useConfirm = () => {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((text: string) => new Promise<boolean>(resolve => setPending({ text, resolve })), []);

  const close = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const dialog = (
    <Confirmation
      isOpen={pending !== null}
      text={pending?.text ?? ''}
      onCancel={() => close(false)}
      onConfirm={() => close(true)}
    />
  );

  return { confirm, dialog };
};
