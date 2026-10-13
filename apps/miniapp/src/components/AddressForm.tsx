import { Input, Section, Textarea } from '@telegram-apps/telegram-ui';
import type { DeliveryAddress } from '@tma-shop/shared';

export const EMPTY_ADDRESS: DeliveryAddress = {
  name: '',
  line1: '',
  line2: '',
  postalCode: '',
  city: '',
  region: '',
  country: '',
  phone: '',
  notes: '',
};

/** Fields every delivery needs. */
export function addressComplete(a: DeliveryAddress): boolean {
  return [a.name, a.line1, a.postalCode, a.city, a.country].every((v) => v.trim() !== '');
}

export function trimAddress(a: DeliveryAddress): DeliveryAddress {
  return {
    name: a.name.trim(),
    line1: a.line1.trim(),
    line2: a.line2.trim(),
    postalCode: a.postalCode.trim(),
    city: a.city.trim(),
    region: a.region.trim(),
    country: a.country.trim(),
    phone: a.phone.trim(),
    notes: a.notes.trim(),
  };
}

/** Delivery address fields (encrypted before leaving the device). */
export function AddressForm({
  value,
  onChange,
}: {
  value: DeliveryAddress;
  onChange: (next: DeliveryAddress) => void;
}): React.JSX.Element {
  const set =
    (field: keyof DeliveryAddress) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void =>
      onChange({ ...value, [field]: e.target.value });

  return (
    <Section
      header="Delivery address"
      footer="🔒 Encrypted on your phone before it is sent. Only the shop can read it."
    >
      <Input header="Full name *" value={value.name} onChange={set('name')} />
      <Input header="Address *" placeholder="Street, number" value={value.line1} onChange={set('line1')} />
      <Input
        header="Apartment, floor (optional)"
        value={value.line2}
        onChange={set('line2')}
      />
      <Input header="Postal code *" value={value.postalCode} onChange={set('postalCode')} />
      <Input header="City *" value={value.city} onChange={set('city')} />
      <Input header="Region / province" value={value.region} onChange={set('region')} />
      <Input header="Country *" value={value.country} onChange={set('country')} />
      <Input header="Phone" type="tel" value={value.phone} onChange={set('phone')} />
      <Textarea header="Notes for delivery" value={value.notes} onChange={set('notes')} />
    </Section>
  );
}
