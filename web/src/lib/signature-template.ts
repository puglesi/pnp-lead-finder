/** Assinatura padrão Panek Pugliesi — London Property Services */

export const SIGNATURE_CONTACTS = {
  name: "Carlos Pugliesi",
  role: "Director",
  phone: "+44 (0) 20 7946 0958",
  email: "info@panekpuglesi.co.uk",
  website: "https://www.panekpuglesi.co.uk",
  websiteLabel: "www.panekpuglesi.co.uk",
  linkedin: "https://www.linkedin.com/company/panek-pugliesi",
  linkedinLabel: "LinkedIn",
} as const;

export const SIGNATURE_SERVICES =
  "Lettings | Property Management | Investments | Relocation";

export const SIGNATURE_TAGLINE =
  "Professional property services, built around presentation, strategy and trust.";

export const SIGNATURE_DISCLAIMER =
  "This e-mail and any attachments are confidential and may be legally privileged. If you are not the intended recipient, please notify the sender immediately and delete this message. Panek Pugliesi Ltd — London Property Services. Registered in England and Wales.";

export const DEFAULT_SIGNATURE_HTML = `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;padding-top:18px;border-top:2px solid #1e3a5f;font-family:Georgia,'Times New Roman',serif;max-width:560px;color:#1a1a1a;">
<tr>
<td style="vertical-align:top;padding-bottom:14px;">
<table cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="vertical-align:middle;padding-right:16px;">
<div style="width:56px;height:56px;border:2px solid #1e3a5f;border-radius:4px;text-align:center;line-height:52px;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#1e3a5f;letter-spacing:-1px;">P</div>
</td>
<td style="vertical-align:middle;">
<p style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;line-height:1.1;color:#1e3a5f;letter-spacing:0.5px;">
<span style="font-weight:800;">PANE K</span><span style="font-weight:400;color:#8b7355;">&amp;</span><span style="font-weight:800;">PUGLIESI</span>
</p>
<p style="margin:4px 0 0;padding:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#6b7280;">London Property Services</p>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding-bottom:10px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#111827;">${SIGNATURE_CONTACTS.name} <span style="font-weight:400;color:#6b7280;">— ${SIGNATURE_CONTACTS.role}</span></p>
</td>
</tr>
<tr>
<td style="padding-bottom:12px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.8;color:#374151;">
<span style="font-weight:700;color:#1e3a5f;">T</span>&nbsp;<a href="tel:${SIGNATURE_CONTACTS.phone.replace(/\s/g, "")}" style="color:#374151;text-decoration:none;">${SIGNATURE_CONTACTS.phone}</a>
&nbsp;&nbsp;<span style="color:#d1d5db;">|</span>&nbsp;&nbsp;
<span style="font-weight:700;color:#1e3a5f;">E</span>&nbsp;<a href="mailto:${SIGNATURE_CONTACTS.email}" style="color:#1e3a5f;text-decoration:none;">${SIGNATURE_CONTACTS.email}</a>
&nbsp;&nbsp;<span style="color:#d1d5db;">|</span>&nbsp;&nbsp;
<span style="font-weight:700;color:#1e3a5f;">W</span>&nbsp;<a href="${SIGNATURE_CONTACTS.website}" style="color:#1e3a5f;text-decoration:none;">${SIGNATURE_CONTACTS.websiteLabel}</a>
&nbsp;&nbsp;<span style="color:#d1d5db;">|</span>&nbsp;&nbsp;
<span style="font-weight:700;color:#1e3a5f;">L</span>&nbsp;<a href="${SIGNATURE_CONTACTS.linkedin}" style="color:#1e3a5f;text-decoration:none;">${SIGNATURE_CONTACTS.linkedinLabel}</a>
</p>
</td>
</tr>
<tr>
<td style="padding-bottom:10px;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.3px;color:#8b7355;">${SIGNATURE_SERVICES}</p>
</td>
</tr>
<tr>
<td style="padding-bottom:14px;">
<p style="margin:0;font-family:Georgia,serif;font-size:12px;font-style:italic;line-height:1.5;color:#4b5563;">${SIGNATURE_TAGLINE}</p>
</td>
</tr>
<tr>
<td style="padding-top:10px;border-top:1px solid #e5e7eb;">
<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:1.45;color:#9ca3af;">${SIGNATURE_DISCLAIMER}</p>
</td>
</tr>
</table>`;