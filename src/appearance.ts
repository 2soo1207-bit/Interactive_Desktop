export function publicAsset(path: string) {
  return `${import.meta.env.BASE_URL}${path}`
}

export const appearance = {
  profileImage: 'brand/profile-3ce.png',
  profileName: '3CE Studio',
  logo: null as string | null,
}

export function wordmark() {
  return appearance.logo
    ? `<img class="brand-logo" src="${publicAsset(appearance.logo)}" alt="3CE">`
    : '<span class="brand-wordmark">3CE</span>'
}
