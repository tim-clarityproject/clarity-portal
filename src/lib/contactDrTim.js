// Same WhatsApp/iMessage rule as the floating chat widget
// (src/components/WhatsAppWidget.jsx): WhatsApp in the UK/Europe,
// iMessage in the US/Canada. Kept as its own small shared helper rather
// than touching that widget, since only the About page (prompt 7c)
// needs it reused here.
const WHATSAPP_NUMBER = '447792332439';
const IMESSAGE_NUMBER = '+447792332439';
const MESSAGE = "Hi Tim, I'd like to chat with you.";

async function isNorthAmerica() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone.startsWith('America/') || timezone.startsWith('Canada/')) return true;
  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    return data.country_code === 'US' || data.country_code === 'CA';
  } catch (error) {
    console.error('[contactDrTim] geolocation fetch failed:', error);
    return false;
  }
}

export async function openContactDrTim() {
  const text = encodeURIComponent(MESSAGE);
  if (await isNorthAmerica()) {
    window.location.href = `imessage://${IMESSAGE_NUMBER}?text=${text}`;
  } else {
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
  }
}
