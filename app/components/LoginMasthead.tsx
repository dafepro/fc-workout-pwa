import { copy } from "../content/copy";

/**
 * The masthead every sign-in card opens with. The player card had it and the
 * two staff cards did not, so the three doors into the product did not look
 * like the same product.
 */
export function LoginMasthead() {
  return (
    <>
      <div className="brand__mark" aria-hidden="true">
        {copy.brand[0]}
      </div>
      <p className="eyebrow">{copy.brand}</p>
    </>
  );
}
