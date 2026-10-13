import { useState } from 'react';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { ShopAdminView } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useShop } from '../../providers/ShopProvider.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';
import { AdminOnly, ErrorBanner, useAdminActions } from './common.js';

/** Shop name, description and image, editable by the shop's own admins. */
export function AdminSettingsPage(): React.JSX.Element {
  return (
    <AdminOnly>
      <AdminSettings />
    </AdminOnly>
  );
}

function AdminSettings(): React.JSX.Element {
  const [reloadKey, setReloadKey] = useState(0);
  const view = useAsync(() => api.adminGetShop(), [reloadKey]);

  if (view.loading && !view.data) return <Loader />;
  if (view.error) return <ErrorView message={view.error} />;
  if (!view.data) return <Loader />;

  return (
    <List>
      <ProfileForm
        key={`${view.data.name}|${view.data.description}|${view.data.imageUrl ?? ''}`}
        view={view.data}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
      <AutoCancelForm
        key={`auto-cancel-${view.data.autoCancelHours}`}
        view={view.data}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </List>
  );
}

function ProfileForm({
  view,
  onSaved,
}: {
  view: ShopAdminView;
  onSaved: () => void;
}): React.JSX.Element {
  const { reload } = useShop();
  const actions = useAdminActions(() => {
    onSaved();
    reload();
  });
  const [name, setName] = useState(view.name);
  const [description, setDescription] = useState(view.description);
  const [imageUrl, setImageUrl] = useState(view.imageUrl ?? '');
  const [busy, setBusy] = useState(false);

  const image = imageUrl.trim();
  const imageInvalid = image !== '' && !/^https:\/\/\S+$/i.test(image);
  const unchanged =
    name.trim() === view.name &&
    description.trim() === view.description &&
    (image || null) === view.imageUrl;

  const save = async (): Promise<void> => {
    setBusy(true);
    await actions.run(() =>
      api.adminUpdateProfile({
        name: name.trim(),
        description: description.trim(),
        imageUrl: image === '' ? null : image,
      }),
    );
    setBusy(false);
  };

  return (
    <>
      <ErrorBanner message={actions.error} />
      <Section header="Store profile" footer="Shown in the shop list and at the top of the catalog.">
        <Input header="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          header="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          header={imageInvalid ? 'Image URL — must start with https://' : 'Image URL (optional)'}
          type="url"
          placeholder="https://…/logo.png"
          status={imageInvalid ? 'error' : 'default'}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {image !== '' && !imageInvalid && (
          <div style={{ padding: '8px 16px' }}>
            <ProductImage url={image} alt="Preview" size={96} />
          </div>
        )}
        <div style={{ padding: 16 }}>
          <Button
            stretched
            loading={busy}
            disabled={!name.trim() || imageInvalid || unchanged}
            onClick={() => void save()}
          >
            Save profile
          </Button>
        </div>
      </Section>

      <Section
        header="Access"
        footer="Visibility, link name and the list of admins are managed by the platform admin."
      >
        <Cell after={`/${view.slug}`}>Link name</Cell>
        <Cell after={view.isVisible ? 'Visible' : '🙈 Hidden'}>Visibility</Cell>
        <Cell after={view.adminIds.join(', ') || '—'} multiline>
          Admins
        </Cell>
      </Section>
    </>
  );
}

/** How long an unpaid order waits before it is cancelled automatically. */
function AutoCancelForm({
  view,
  onSaved,
}: {
  view: ShopAdminView;
  onSaved: () => void;
}): React.JSX.Element {
  const actions = useAdminActions(onSaved);
  const [hours, setHours] = useState(String(view.autoCancelHours));
  const value = Number(hours.trim());
  const invalid = hours.trim() === '' || !Number.isInteger(value) || value < 0 || value > 720;

  return (
    <>
      <ErrorBanner message={actions.error} />
      <Section
        header="Unpaid orders"
        footer="Orders with no payment sent are cancelled after this many hours without activity, and the customer gets a message. Orders with a payment under review are never cancelled. 0 = never."
      >
        <Input
          header="Cancel unpaid orders after (hours, 0 = never)"
          inputMode="numeric"
          status={invalid ? 'error' : 'default'}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <div style={{ padding: 16 }}>
          <Button
            stretched
            disabled={invalid || value === view.autoCancelHours}
            onClick={() => void actions.run(() => api.adminUpdateAutoCancel(value))}
          >
            Save
          </Button>
        </div>
      </Section>
    </>
  );
}
