import { useState } from 'react';
import { List } from '@telegram-apps/telegram-ui';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { OrderFeeForm } from './OrderFeeForm.js';
import { AdminOnly, ErrorBanner, useAdminActions } from './common.js';

/** Fixed fee added once to every new order (0 = none, hidden from customers). */
export function AdminFeePage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminFee />
    </AdminOnly>
  );
}

function AdminFee(): React.JSX.Element {
  const [reloadKey, setReloadKey] = useState(0);
  const actions = useAdminActions(() => setReloadKey((k) => k + 1));
  const shop = useAsync(() => api.getShop(), [reloadKey]);

  if (shop.loading && !shop.data) return <Loader />;
  if (shop.error) return <ErrorView message={shop.error} />;
  if (!shop.data) return <Loader />;

  return (
    <List>
      <ErrorBanner message={actions.error} />
      <OrderFeeForm
        key={`${shop.data.orderFee}-${shop.data.orderFeeLabel}`}
        fee={shop.data.orderFee}
        label={shop.data.orderFeeLabel}
        onSave={(fee, label) => actions.run(() => api.adminUpdateOrderFee(fee, label))}
      />
    </List>
  );
}
