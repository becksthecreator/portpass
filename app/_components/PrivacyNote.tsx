// The one-line pointer to the Privacy Policy and Terms shown where a form
// collects personal details (privacy policy v2, brief 16 D). The full
// address is used so it also works on a business's own domain, and it
// opens in a new tab so a half-filled form is not lost.
export function PrivacyNote({ about = "request", childDetails = false }: { about?: string; childDetails?: boolean }) {
  return (
    <p className="privacy-note">
      We use what you send only to handle this {about}.{" "}
      <a href={childDetails ? "https://portpassbahamas.com/privacy#children" : "https://portpassbahamas.com/privacy"} target="_blank" rel="noopener">
        Privacy Policy
      </a>
      {" · "}
      <a href="https://portpassbahamas.com/terms" target="_blank" rel="noopener">
        Terms
      </a>
    </p>
  );
}
