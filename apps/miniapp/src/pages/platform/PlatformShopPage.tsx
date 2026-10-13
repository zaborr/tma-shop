import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, Input, List, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { PlatformShopInput, ShopAdminView } from '@tma-shop/shared';
import { api } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSession } from '../../providers/SessionProvider.js';
import { toSlug } from '../../lib/slug.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';
import { ErrorBanner, useAdminActions } from '../admin/common.js';

/** `/platform/shops/new` creates a shop; `/platform/shops/:id` edits one. */
export function PlatformShopPage(): React.JSX.Element {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorView message="Platform admins only" />;
  return <PlatformShop />;
}

/** "123, 456" → [123, 456]; returns null when something is not a Telegram id. */
export function parseIds(text: string): number[] | null {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.every((part) => /^\d{1,15}$/.test(part))) return null;
  return [...new Set(parts.map(Number))].filter((id) => id > 0);
}

function PlatformShop(): React.JSX.Element {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const shops = useAsync(
    (): Promise<ShopAdminView[]> => (isNew ? Promise.resolve([]) : api.platformGetShops()),
    [id],
  );

  if (shops.loading) return <Loader />;
  if (shops.error) return <ErrorView message={shops.error} />;
  const shop = isNew ? null : (shops.data?.find((s) => s.id === id) ?? null);
  if (!isNew && !shop) return <ErrorView message="Shop not found" />;

  return <ShopForm key={shop?.id ?? 'new'} shop={shop} />;
}

function ShopForm({ shop }: { shop: ShopAdminView | null }): React.JSX.Element {
  const navigate = useNavigate();
  const { user } = useSession();
  const actions = useAdminActions(() => undefined);

  const [name, setName] = useState(shop?.name ?? '');
  const [slug, setSlug] = useState(shop?.slug ?? '');
  const [description, setDescription] = useState(shop?.description ?? '');
  const [imageUrl, setImageUrl] = useState(shop?.imageUrl ?? '');
  const [isVisible, setIsVisible] = useState(shop?.isVisible ?? false);
  const [sortOrder, setSortOrder] = useState(String(shop?.sortOrder ?? 0));
  const [admins, setAdmins] = useState(
    (shop?.adminIds ?? (user ? [user.telegramId] : [])).join(', '),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const slugValue = slug.trim() || toSlug(name);
  const image = imageUrl.trim();
  const imageInvalid = image !== '' && !/^https:\/\/\S+$/i.test(image);
  const adminIds = parseIds(admins);
  const order = Number(sortOrder);
  const orderInvalid = !Number.isInteger(order) || Math.abs(order) > 1000;
  const invalid = !name.trim() || imageInvalid || adminIds === null || orderInvalid;

  const save = async (): Promise<void> => {
    if (adminIds === null) return;
    const input: PlatformShopInput = {
      name: name.trim(),
      slug: slugValue,
      description: description.trim(),
      imageUrl: image === '' ? null : image,
      isVisible,
      sortOrder: order,
      adminIds,
    };
    setBusy(true);
    setSaved(false);
    await actions.run(async () => {
      if (shop) {
        await api.platformUpdateShop(shop.id, input);
        setSaved(true);
      } else {
        await api.platformCreateShop(input);
        navigate('/platform', { replace: true });
      }
    });
    setBusy(false);
  };

  const deleteKey = `delete-shop:${shop?.id ?? ''}`;

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section header={shop ? `Edit shop: ${shop.name}` : 'New shop'}>
        <Input header="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          header="Slug (link name, optional)"
          placeholder={name ? toSlug(name) : 'tea-shop'}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
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
      </Section>

      <Section
        header="Visibility"
        footer="Hidden shops only appear to their admins and to platform admins — handy while you set them up."
      >
        <Cell
          after={
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="s"
                mode={isVisible ? 'filled' : 'bezeled'}
                onClick={() => setIsVisible(true)}
              >
                Visible
              </Button>
              <Button
                size="s"
                mode={isVisible ? 'bezeled' : 'filled'}
                onClick={() => setIsVisible(false)}
              >
                Hidden
              </Button>
            </div>
          }
        >
          {isVisible ? 'Customers see it' : '🙈 Only admins see it'}
        </Cell>
        <Input
          header="Order in the shop list (1 = first)"
          type="text"
          inputMode="numeric"
          status={orderInvalid ? 'error' : 'default'}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Section>

      <Section
        header="Shop admins"
        footer="Telegram user ids, separated by commas. Each admin must have started the bot to receive order messages. Anyone can get their id from @userinfobot."
      >
        <Input
          header={adminIds === null ? 'Only numbers, separated by commas' : 'Admin Telegram ids'}
          placeholder="123456789, 987654321"
          status={adminIds === null ? 'error' : 'default'}
          value={admins}
          onChange={(e) => setAdmins(e.target.value)}
        />
      </Section>

      <Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button stretched loading={busy} disabled={invalid} onClick={() => void save()}>
            {shop ? 'Save shop' : 'Create shop'}
          </Button>
          {saved && <Cell>Saved ✓</Cell>}
          {shop && (
            <Button
              stretched
              mode="plain"
              onClick={() =>
                void actions.twoTap(deleteKey, async () => {
                  await api.platformDeleteShop(shop.id);
                  navigate('/platform', { replace: true });
                })
              }
            >
              {actions.tapLabel(deleteKey, 'Delete shop', 'Tap again to delete everything')}
            </Button>
          )}
        </div>
      </Section>
    </List>
  );
}
