import Link from "next/link";
import { RegistrationForm } from "./RegistrationForm";

export const metadata = {
  title: "Register | Futprep Lil Kickers",
  description: "Register a child for Futprep Lil Kickers Term 1.",
};

export default function FutprepRegisterPage() {
  return (
    <main className="registration-page futprep-theme">
      <header className="site-header form-header registration-header">
        <Link className="brand" href="/"><span className="brand-mark">P</span><span>PORTPASS</span></Link>
        <div className="registration-header-right">
          <div className="futprep-program-brand compact"><img src="/futprep-logo.png" alt="Futprep Athletics" /><span><b>LIL KICKERS</b><small>by Futprep Athletics</small></span></div>
          <Link className="header-link" href="/futprep/lil-kickers">Program details</Link>
        </div>
      </header>
      <RegistrationForm />
    </main>
  );
}
