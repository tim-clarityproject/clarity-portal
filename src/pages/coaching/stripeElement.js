// Stripe's Payment Element for the client's settle step (Phase 6b run 3, Group C; brief item 8; plan risk 22): card and
// Apple Pay only for the first amount (no Google Pay, no Link, no "settle later"), Bacs Direct Debit for the rest
// (pounds only, risk 16). Stripe draws its own tabs inside its frame, so M28's Card / Apple Pay switch can't be ours:
// the Appearance API is fed from the page's own tokens, read from .ui-root as it is drawn now (dark or light), so the
// form matches the page. Loaded only when a real publishable key comes back from the server; never on a build without
// one (the page then shows its stand-in, never a real card form off the live site).

const readToken = (el, name, fallback = '') => (el ? getComputedStyle(el).getPropertyValue(name).trim() : '') || fallback;

/** Stripe's Appearance from the design tokens (CLAUDE.md design rule 2: no colour of our own here). */
export function appearanceFrom(root) {
  const t = (n, f) => readToken(root, n, f);
  const dark = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
  return {
    theme: dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: t('--coral'),
      colorBackground: t('--card'),
      colorText: t('--text'),
      colorTextSecondary: t('--text-2'),
      colorTextPlaceholder: t('--placeholder'),
      colorDanger: t('--coral-soft-text'),
      colorSuccess: t('--good'),
      fontFamily: t('--font-body'),
      fontSizeBase: '16px',
      borderRadius: t('--radius-field'),
      spacingUnit: t('--space-1'),
    },
    rules: {
      '.Input': { border: `1px solid ${t('--field-line')}`, boxShadow: 'none', padding: '15px 20px' },
      '.Input:focus': { border: `1px solid ${t('--text-2')}`, boxShadow: 'none' },
      '.Tab': { border: `1px solid ${t('--field-line')}`, boxShadow: 'none' },
      '.Tab--selected': { border: `1px solid ${t('--text')}`, boxShadow: 'none' },
      '.Label': { color: t('--text-2') },
    },
  };
}

/**
 * Mounts the Payment Element in `node`. mode 'payment' (the first amount: card and Apple Pay) or 'setup' (Direct Debit
 * for the rest). Resolves { confirm(returnUrl) → { ok } | { ok: false, message }, destroy() }.
 */
export async function mountElement({ node, root, publishableKey, clientSecret, mode = 'payment' }) {
  const { loadStripe } = await import('@stripe/stripe-js');
  const stripe = await loadStripe(publishableKey);
  if (!stripe) throw new Error('Stripe didn’t load.');
  const elements = stripe.elements({ clientSecret, appearance: appearanceFrom(root), loader: 'never' });
  const element = elements.create('payment', mode === 'payment'
    ? { layout: 'tabs', paymentMethodOrder: ['apple_pay', 'card'], wallets: { applePay: 'auto', googlePay: 'never' } }
    : { layout: 'tabs' });
  element.mount(node);
  const confirm = async (returnUrl) => {
    const args = { elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' };
    const { error } = mode === 'payment' ? await stripe.confirmPayment(args) : await stripe.confirmSetup(args);
    // Stripe's own card words are already calm ("Your card was declined."); anything else gets ours.
    if (error) return { ok: false, message: error.type === 'card_error' || error.type === 'validation_error' ? error.message : 'That didn’t go through. Check your details and try again.' };
    return { ok: true };
  };
  return { confirm, destroy: () => { try { element.destroy(); } catch { /* gone already */ } } };
}
