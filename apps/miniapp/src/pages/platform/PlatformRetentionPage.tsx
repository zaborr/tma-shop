import { useState } from 'react';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Input } from '../../components/Field.js';
import type { RetentionReport, RetentionStatus } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSession } from '../../providers/SessionProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ErrorBanner, formatDate, useAdminActions } from '../admin/common.js';

/** Platform super-admin: how long personal data is kept, and a manual cleanup. */
export function PlatformRetentionPage(): React.JSX.Element {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorView message="Platform admins only" />;
  return <Retention />;
}

function Retention(): React.JSX.Element {
  const [reloadKey, setReloadKey] = useState(0);
  const status = useAsync(() => api.platformGetRetention(), [reloadKey]);

  if (status.loading && !status.data) return <Loader />;
  if (status.error) return <ErrorView message={status.error} />;
  if (!status.data) return <Loader />;
  return (
    <RetentionForm
      key={reloadKey}
      status={status.data}
      onSaved={() => setReloadKey((k) => k + 1)}
    />
  );
}

function days(text: string): number | null {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : null;
}

function RetentionForm({
  status,
  onSaved,
}: {
  status: RetentionStatus;
  onSaved: () => void;
}): React.JSX.Element {
  const actions = useAdminActions(() => undefined);
  const [address, setAddress] = useState(String(status.addressRetentionDays));
  const [carts, setCarts] = useState(String(status.cartRetentionDays));
  const [usersDays, setUsersDays] = useState(String(status.inactiveUserDays));
  const [saved, setSaved] = useState(false);
  const [report, setReport] = useState<RetentionReport | null>(null);

  const values = {
    addressRetentionDays: days(address),
    cartRetentionDays: days(carts),
    inactiveUserDays: days(usersDays),
  };
  const valid = Object.values(values).every((v) => v !== null);

  const save = (): void =>
    void actions.run(async () => {
      if (
        values.addressRetentionDays === null ||
        values.cartRetentionDays === null ||
        values.inactiveUserDays === null
      ) {
        return;
      }
      await api.platformUpdateRetention({
        addressRetentionDays: values.addressRetentionDays,
        cartRetentionDays: values.cartRetentionDays,
        inactiveUserDays: values.inactiveUserDays,
      });
      setSaved(true);
      onSaved();
    });

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section
        header="How long personal data is kept"
        footer="Applies to every shop. The cleanup runs every few hours; numbers are days (1–3650)."
      >
        <Input
          header="Orders: delete the address and unlink the customer, days after delivered or cancelled"
          inputMode="numeric"
          status={values.addressRetentionDays === null ? 'error' : 'default'}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <Input
          header="Carts: delete when untouched for (days)"
          inputMode="numeric"
          status={values.cartRetentionDays === null ? 'error' : 'default'}
          value={carts}
          onChange={(e) => setCarts(e.target.value)}
        />
        <Input
          header="Users with no orders: delete after not opening the app for (days)"
          inputMode="numeric"
          status={values.inactiveUserDays === null ? 'error' : 'default'}
          value={usersDays}
          onChange={(e) => setUsersDays(e.target.value)}
        />
        <div style={{ padding: 16 }}>
          <Button stretched disabled={!valid} onClick={save}>
            {saved ? 'Saved ✓' : 'Save'}
          </Button>
        </div>
      </Section>

      <Section
        header="What is kept"
        footer="An anonymized order keeps its products, amounts, payments and the contact @username, so sales and accounts still add up. Orders that still owe a refund are not anonymized until it is recorded."
      >
        <Cell multiline>
          Users only store their Telegram id, first name, @username and language.
        </Cell>
      </Section>

      <Section
        header="Run the cleanup now"
        footer={
          status.lastRunAt ? `Last run: ${formatDate(status.lastRunAt)}` : 'It has not run yet.'
        }
      >
        {report && (
          <Cell multiline>
            {`${report.ordersAnonymized} orders anonymized · ${report.cartsDeleted} carts deleted · ${report.usersDeleted} users deleted`}
          </Cell>
        )}
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode="bezeled"
            onClick={() =>
              void actions.twoTap('run', async () => {
                setReport(await api.platformRunRetention());
              })
            }
          >
            {actions.tapLabel('run', 'Run now', 'Tap again: this deletes data')}
          </Button>
        </div>
      </Section>
    </List>
  );
}
