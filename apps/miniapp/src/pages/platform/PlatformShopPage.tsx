import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Cell, List, Section } from '@telegram-apps/telegram-ui';
import { Input, Textarea } from '../../components/Field.js';
import type { PlatformShopInput, ShopAdminView } from '@tma-shop/shared';
import { api, type ShopContents } from '../../api/client.js';
import { useAsync } from '../../hooks/useAsync.js';
import { useSession } from '../../providers/SessionProvider.js';
import { toSlug } from '../../lib/slug.js';
import { Loader } from '../../components/Loader.js';
import { ErrorView } from '../../components/ErrorView.js';
import { ProductImage } from '../../components/ProductImage.js';
import { ErrorBanner, useAdminActions } from '../admin/common.js';
import { t } from '../../i18n/index.js';

/** `/platform/shops/new` creates a shop; `/platform/shops/:id` edits one. */
export function PlatformShopPage(): React.JSX.Element {
  const { isSuperAdmin } = useSession();
  if (!isSuperAdmin) return <ErrorView message={t('platform.only')} />;
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
  if (!isNew && !shop) return <ErrorView message={t('platformShop.notFound')} />;

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
  const [visibility, setVisibility] = useState<'visible' | 'vip' | 'hidden'>(
    !shop || !shop.isVisible ? 'hidden' : shop.vipOnly ? 'vip' : 'visible',
  );
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
      isVisible: visibility !== 'hidden',
      vipOnly: visibility === 'vip',
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

  return (
    <List>
      <ErrorBanner message={actions.error} />

      <Section header={shop ? t('platformShop.edit', { name: shop.name }) : t('platformShop.new')}>
        <Input header={t('settings.name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          header={t('platformShop.slug')}
          placeholder={name ? toSlug(name) : 'tea-shop'}
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        />
        <Textarea
          header={t('productForm.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          header={imageInvalid ? t('common.imageInvalid') : t('settings.image')}
          type="url"
          placeholder="https://…/logo.png"
          status={imageInvalid ? 'error' : 'default'}
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {image !== '' && !imageInvalid && (
          <div style={{ padding: '8px 16px' }}>
            <ProductImage url={image} alt={t('common.preview')} size={96} />
          </div>
        )}
      </Section>

      <Section
        header={t('settings.visibility')}
        footer={t('platformShop.visibilityFooter')}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 16px 0' }}>
          {(
            [
              ['visible', t('settings.visible')],
              ['vip', t('platformShop.vipOnly')],
              ['hidden', t('platformShop.hidden')],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="s"
              mode={visibility === value ? 'filled' : 'bezeled'}
              onClick={() => setVisibility(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Cell multiline>
          {visibility === 'visible'
            ? t('platformShop.customersSee')
            : visibility === 'vip'
              ? t('platformShop.onlyVip')
              : t('platformShop.onlyAdmins')}
        </Cell>
        <Input
          header={t('platformShop.order')}
          type="text"
          inputMode="numeric"
          status={orderInvalid ? 'error' : 'default'}
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </Section>

      <Section
        header={t('platformShop.admins')}
        footer={t('platformShop.adminsFooter')}
      >
        <Input
          header={adminIds === null ? t('platformShop.adminsInvalid') : t('platformShop.adminsField')}
          placeholder="123456789, 987654321"
          status={adminIds === null ? 'error' : 'default'}
          value={admins}
          onChange={(e) => setAdmins(e.target.value)}
        />
      </Section>

      <Section>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
          <Button stretched loading={busy} disabled={invalid} onClick={() => void save()}>
            {shop ? t('platformShop.save') : t('platformShop.create')}
          </Button>
          {saved && <Cell>Saved ✓</Cell>}
        </div>
      </Section>

      {shop && (
        <DeleteShopSection shop={shop} onDeleted={() => navigate('/platform', { replace: true })} />
      )}
    </List>
  );
}

type DeleteStep = 'idle' | 'review' | 'type' | 'final';

/**
 * Deleting a shop with everything in it, in several deliberate steps: see what
 * goes, type the shop's name, then tap the final button twice.
 */
function DeleteShopSection({
  shop,
  onDeleted,
}: {
  shop: ShopAdminView;
  onDeleted: () => void;
}): React.JSX.Element {
  const actions = useAdminActions(() => undefined);
  const [step, setStep] = useState<DeleteStep>('idle');
  const [contents, setContents] = useState<ShopContents | null>(null);
  const [typed, setTyped] = useState('');
  const nameMatches = typed.trim() === shop.name.trim();
  const danger: React.CSSProperties = { color: 'var(--tgui--destructive_text_color)' };

  const cancel = (): void => {
    setStep('idle');
    setTyped('');
  };
  const cancelButton = (
    <Button stretched mode="bezeled" onClick={cancel}>
      {t('deleteShop.keep')}
    </Button>
  );

  return (
    <>
    <ErrorBanner message={actions.error} />
    <Section header={t('deleteShop.zone')}>
      {step === 'idle' && (
        <div style={{ padding: 16 }}>
          <Button
            stretched
            mode="plain"
            onClick={() =>
              void actions.run(async () => {
                setContents(await api.platformShopContents(shop.id));
                setStep('review');
              })
            }
          >
            <span style={danger}>{t('deleteShop.start')}</span>
          </Button>
        </div>
      )}

      {step === 'review' && contents && (
        <>
          <Cell multiline style={danger}>
            {t('deleteShop.step1', { name: shop.name })}
          </Cell>
          <Cell after={String(contents.orders)}>{t('deleteShop.orders')}</Cell>
          <Cell after={String(contents.products)}>{t('deleteShop.products')}</Cell>
          <Cell after={String(contents.categories)}>{t('categories.title')}</Cell>
          <Cell after={String(contents.carts)}>{t('deleteShop.carts')}</Cell>
          <Cell multiline>{t('deleteShop.cannotUndo')}</Cell>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
            <Button stretched mode="plain" onClick={() => setStep('type')}>
              <span style={danger}>{t('deleteShop.understand')}</span>
            </Button>
            {cancelButton}
          </div>
        </>
      )}

      {step === 'type' && (
        <>
          <Cell multiline style={danger}>
            {t('deleteShop.step2')}
          </Cell>
          <Input
            header={t('deleteShop.nameField', { name: shop.name })}
            placeholder={shop.name}
            status={typed && !nameMatches ? 'error' : 'default'}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
            <Button
              stretched
              mode="plain"
              disabled={!nameMatches}
              onClick={() => setStep('final')}
            >
              <span style={nameMatches ? danger : undefined}>{t('deleteShop.continue')}</span>
            </Button>
            {cancelButton}
          </div>
        </>
      )}

      {step === 'final' && (
        <>
          <Cell multiline style={danger}>
            {t('deleteShop.step3')}
          </Cell>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
            <Button
              stretched
              mode="filled"
              style={{ background: 'var(--tgui--destructive_text_color)' }}
              onClick={() =>
                void actions.twoTap('delete-forever', async () => {
                  await api.platformDeleteShopWithEverything(shop.id, typed);
                  onDeleted();
                })
              }
            >
              {actions.tapLabel(
                'delete-forever',
                t('deleteShop.forever'),
                t('deleteShop.foreverConfirm'),
              )}
            </Button>
            {cancelButton}
          </div>
        </>
      )}
    </Section>
    </>
  );
}
