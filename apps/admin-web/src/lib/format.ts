const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatPrice = (n: number) => currency.format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
