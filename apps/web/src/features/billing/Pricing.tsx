import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import {
  formatMoney,
  plans,
  type BillingCurrency,
  type BillingInterval,
} from '@snapform/contracts/plans';
import { PublicInfo } from '../info/PublicInfo';
import { fetchBillingOptions } from './api';
import { PlanChoices, proPrice } from './PlanChoices';
import './billing.css';

const counts = new Intl.NumberFormat('en');
// Only features that exist today, or are flagged and labelled as coming soon.
export function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>('monthly'),
    [currency, setCurrency] = useState<BillingCurrency>('INR'),
    [offered, setOffered] = useState<BillingCurrency[]>(['INR']);
  useEffect(() => {
    const controller = new AbortController();
    void fetchBillingOptions(controller.signal).then(setOffered);
    return () => controller.abort();
  }, []);
  return (
    <PublicInfo
      title="Plans for each workspace."
      intro="Start free. Upgrade a workspace when it needs more forms, more responses or a team."
    >
      <PlanChoices
        interval={interval}
        currency={currency}
        currencies={offered}
        onInterval={setInterval}
        onCurrency={setCurrency}
      />
      <section aria-labelledby="free-plan">
        <h2 id="free-plan">Free</h2>
        <p>{formatMoney(currency, 0)}</p>
        <ul>
          <li>{plans.free.liveForms} live forms</li>
          <li>{plans.free.monthlyResponses} responses a month</li>
          <li>{plans.free.seats} seat, for you</li>
          <li>Share forms by link</li>
          <li>Forms show a “Powered by Snapform” badge</li>
        </ul>
        <Link to="/start">Start free</Link>
      </section>
      <section aria-labelledby="pro-plan">
        <h2 id="pro-plan">Pro</h2>
        <p>{proPrice(interval, currency)}</p>
        <ul>
          <li>Unlimited live forms</li>
          <li>{counts.format(plans.pro.monthlyResponses)} responses a month</li>
          <li>{plans.pro.seats} seats, so you can invite your team</li>
          <li>No “Powered by Snapform” badge on your forms</li>
          <li>Embed forms on your website</li>
          <li>Coming soon: file uploads</li>
        </ul>
        <Link to="/app">Upgrade from your workspace</Link>
      </section>
      <section aria-labelledby="both-plans">
        <h2 id="both-plans">Both plans</h2>
        <p>
          Conditional questions, email notifications, webhooks and CSV export.
          Responses reset at 00:00 UTC on the 1st of each month. Payments go
          through Razorpay. After you cancel, Pro lasts until the paid period
          ends. See the{' '}
          <Link to="/refunds">cancellation and refund policy</Link> and{' '}
          <Link to="/terms">terms of service</Link>.
        </p>
      </section>
    </PublicInfo>
  );
}
