export const formatAddress = (str: string, symbols: number = 8) => {
  if (str.length <= symbols) {
    return str;
  } else if (symbols === 0) {
    return "...";
  }

  return `${str.slice(0, symbols / 2)}...${str.slice(-symbols / 2)}`;
};
