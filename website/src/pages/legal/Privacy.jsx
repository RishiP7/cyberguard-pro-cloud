import React from "react";

export default function PrivacyPolicy(){
  return (
    <section>
      <h1 style={{marginTop:0}}>Privacy Policy</h1>
      <p><i>Effective date: [YYYY-MM-DD] • Last updated: [YYYY-MM-DD]</i></p>

      <p>
        This Privacy Policy explains how <b>[Company Name]</b> (“we”) collects,
        uses, and shares information when you visit our website, create an account,
        or use our services (the “Services”).
      </p>

      <h2>1) Who we are</h2>
      <p>
        Legal entity: <b>[Company Name]</b><br/>
        Registered office: <b>[Address]</b><br/>
        Contact: <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>
      </p>

      <h2>2) Information we collect</h2>
      <ul>
        <li><b>Account</b> – name, email, password hash, role, subscription status.</li>
        <li><b>Billing</b> – managed by our payment provider (e.g., Stripe). No full card numbers stored.</li>
        <li><b>Service data</b> – security events you send (e.g., email/EDR/DNS/cloud metadata).</li>
        <li><b>Usage & diagnostics</b> – device, browser, IP (security), timestamps, crash logs.</li>
        <li><b>Support</b> – messages you send to support.</li>
        <li><b>Cookies</b> – see Cookie Policy.</li>
      </ul>

      <h2>3) How we use information</h2>
      <ul>
        <li>Provide and secure the Services (auth, threat detection, fraud prevention).</li>
        <li>Operate accounts, subscriptions, billing, and support.</li>
        <li>Improve performance and user experience; develop new features.</li>
        <li>Comply with legal obligations and enforce agreements.</li>
      </ul>

      <h2>4) Legal bases (UK/EU)</h2>
      <ul>
        <li><b>Contract</b> – provide the Services you request.</li>
        <li><b>Legitimate interests</b> – secure and improve the Services.</li>
        <li><b>Consent</b> – optional analytics/marketing cookies where required.</li>
        <li><b>Legal obligation</b> – compliance and record-keeping.</li>
      </ul>

      <h2>5) Sharing & transfers</h2>
      <p>
        We share data with trusted processors for hosting, email, analytics, and payments under DPAs
        (and SCCs/IDTA for international transfers). We do not sell personal information.
      </p>

      <h2>6) Retention</h2>
      <p>We keep personal data only as long as needed for the purposes above or as required by law.</p>

      <h2>7) Security</h2>
      <p>We use reasonable administrative, technical, and physical safeguards appropriate to risk.</p>

      <h2>8) Your rights</h2>
      <p>
        Depending on your location, you may request access, correction, deletion, restriction,
        objection, and portability. Contact <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>.
      </p>

      <h2>9) Children</h2>
      <p>Our Services are not directed to children under 16.</p>

      <h2>10) Changes</h2>
      <p>We may update this policy; material changes will be highlighted.</p>

      <h2>11) Contact</h2>
      <p>Email <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>.</p>
    </section>
  );
}
