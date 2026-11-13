import {
  formatPrice,
  type BillingCurrency,
  type BillingInterval,
} from '@snapform/contracts/plans';

const intervals = [
  ['monthly', 'Monthly'],
  ['annual', 'Annual, 2 months free'],
] as const;
const currencies = [
  ['INR', 'INR ₹'],
  ['USD', 'USD $'],
] as const;
function Choices<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="choice-row">
      <legend>{props.legend}</legend>
      {props.options.map(([value, label]) => (
        <label key={value}>
          <input
            type="radio"
            name={props.name}
            value={value}
            checked={props.value === value}
            onChange={() => props.onChange(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}
export function PlanChoices(props: {
  interval: BillingInterval;
  currency: BillingCurrency;
  onInterval: (value: BillingInterval) => void;
  onCurrency: (value: BillingCurrency) => void;
}) {
  return (
    <>
      <Choices
        legend="Billing period"
        name="interval"
        value={props.interval}
        options={intervals}
        onChange={props.onInterval}
      />
      <Choices
        legend="Currency"
        name="currency"
        value={props.currency}
        options={currencies}
        onChange={props.onCurrency}
      />
    </>
  );
}
export const proPrice = (
  interval: BillingInterval,
  currency: BillingCurrency,
) =>
  `${formatPrice(interval, currency)} ${interval === 'annual' ? 'a year' : 'a month'}`;
