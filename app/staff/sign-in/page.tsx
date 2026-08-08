import Link from "next/link";
import { copy } from "../../content/copy";
import { routes } from "../../content/routes";

export default function StaffSignInPage() {
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="staff-sign-in-title">
        <p className="eyebrow">{copy.brand}</p>
        <h1 id="staff-sign-in-title">{copy.staff.signInTitle}</h1>
        <p>{copy.staff.signInIntro}</p>
        <p className="login-help">{copy.staff.comingSoon}</p>
        <p className="login-staff">
          <Link href={routes.playerSignIn}>{copy.staff.playerLink}</Link>
        </p>
      </section>
    </main>
  );
}
