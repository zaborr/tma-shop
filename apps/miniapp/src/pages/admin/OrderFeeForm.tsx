import { useState } from 'react';
import { Button, Input, Section } from '@telegram-apps/telegram-ui';
import { toMajor } from './common.js';

/** Fixed fee added once to every new order; 0 hides it everywhere. */
export function OrderFeeForm({
  fee,
  label,
  onSave,
}: {
  fee: number;
  label: string;
  onSave: (fee: number, label: string) => Promise<void>;
}): React.JSX.Element {
  const [amount, setAmount] = useState(fee > 0 ? toMajor(fee) : '0');
  const [name, setName] = useState(label);
  const [busy, setBusy] = useState(false);

  const value = amount.trim().replace(',', '.');
  const invalid = !/^\d+(\.\d{1,2})?$/.test(value) || !name.trim();
  const cents = invalid ? 0 : Math.round(Number(value) * 100);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      await onSave(cents, name.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      header="Order fee"
      footer={
        fee > 0
          ? `Each new order includes "${label}" once, in the order's currency (USDC or EURC). Set 0 to remove it.`
          : 'No fee is charged now, and it is not shown to customers. Set an amount to add it once to every new order.'
      }
    >
      <Input
        header="Amount (e.g. 1.50 — 0 for none)"
        type="text"
        inputMode="decimal"
        status={invalid ? 'error' : 'default'}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        header="Name shown to customers"
        placeholder="Service fee"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div style={{ padding: 16 }}>
        <Button
          stretched
          mode="bezeled"
          loading={busy}
          disabled={invalid || (cents === fee && name.trim() === label)}
          onClick={() => void save()}
        >
          Save fee
        </Button>
      </div>
    </Section>
  );
}
