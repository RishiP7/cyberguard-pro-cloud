import React from "react";

export default function Accessibility(){
  return (
    <section>
      <h1 style={{marginTop:0}}>Accessibility Statement</h1>
      <p><i>Effective date: [YYYY-MM-DD]</i></p>

      <p>We aim to meet WCAG 2.1 AA and improve usability across assistive tech.</p>

      <h2>Measures</h2>
      <ul>
        <li>Semantic HTML, keyboard operability, sufficient contrast.</li>
        <li>Alt text for meaningful images; labels for form controls.</li>
        <li>Regular audits via automated tools and manual testing.</li>
      </ul>

      <h2>Feedback</h2>
      <p>If you encounter barriers, email <a href="mailto:support@yourdomain.com">support@yourdomain.com</a>.</p>

      <h2>Compatibility</h2>
      <p>Supported: latest Safari, Chrome, Edge, Firefox. Older browsers may be limited.</p>
    </section>
  );
}
