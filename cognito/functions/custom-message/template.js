// Table-based, inline-styled HTML so it renders in Gmail, Outlook and Apple Mail.
const BRAND = {
  name: "Kudozz",
  site: "https://www.kudozz.in",
  siteLabel: "kudozz.in",
  coral: "#F36B4A",
  charcoal: "#202124",
  muted: "#76777D",
  cream: "#FBF7F2",
  border: "#EFE7DD",
};

const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** `code` is Cognito's placeholder ({####}) and is inserted verbatim. */
export const renderEmail = ({ preheader, heading, greetingName, intro, code, expiry, footnote }) => {
  const greeting = greetingName ? `Hi ${escape(greetingName)},` : "Hi there,";
  const year = new Date().getUTCFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 20px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.3px;color:${BRAND.charcoal};">
      ${BRAND.name}<span style="color:${BRAND.coral};">.</span>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="height:4px;background:${BRAND.coral};background-image:linear-gradient(90deg,#F36B4A,#FFAD66);font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:36px 36px 8px;font-family:Arial,Helvetica,sans-serif;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:700;color:${BRAND.charcoal};">${escape(heading)}</h1>
          <p style="margin:0 0 12px;font-size:15px;line-height:24px;color:${BRAND.charcoal};">${greeting}</p>
          <p style="margin:0;font-size:15px;line-height:24px;color:#3C3D42;">${escape(intro)}</p>
        </td></tr>
        <tr><td align="center" style="padding:28px 36px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};border:1px dashed #E0D4C6;border-radius:12px;">
            <tr><td style="padding:18px 32px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:36px;font-weight:700;letter-spacing:10px;color:${BRAND.charcoal};text-align:center;">${code}</td></tr>
          </table>
          <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${BRAND.muted};">${escape(expiry)}</p>
        </td></tr>
        <tr><td style="padding:0 36px 32px;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0;padding-top:20px;border-top:1px solid ${BRAND.border};font-size:13px;line-height:21px;color:${BRAND.muted};">${escape(footnote)}</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:24px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:${BRAND.muted};text-align:center;">
      Sent by ${BRAND.name} Influencer Discovery · <a href="${BRAND.site}" style="color:${BRAND.muted};text-decoration:underline;">${BRAND.siteLabel}</a><br>
      For your security, never share this code. ${BRAND.name} will never ask you for it.<br>
      &copy; ${year} ${BRAND.name}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
};
