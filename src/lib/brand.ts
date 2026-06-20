/** Public product identity — keep user-facing copy in sync via these constants. */
export const BRAND_NAME = "AfyaStock";
export const BRAND_DOMAIN = "afyastock.com";
export const BRAND_URL = `https://${BRAND_DOMAIN}`;

export const DEFAULT_CONTACT_EMAIL = "afyastock@gmail.com";
export const DEFAULT_FACILITY_LABEL = "AfyaStock Facility";

export function getContactEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || DEFAULT_CONTACT_EMAIL;
}

export function getDefaultFacilityLabel(): string {
  return process.env.NEXT_PUBLIC_FACILITY_NAME?.trim() || DEFAULT_FACILITY_LABEL;
}
