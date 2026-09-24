type Recipient = { name?: string; phone: string; consent: boolean };

function fields(line: string): string[] {
  const result: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && /[;,|\t]/.test(char || "")) {
      result.push(value.trim()); value = "";
    } else value += char;
  }
  result.push(value.trim());
  return result;
}

export function parseRecipientText(text: string, consent: boolean): Recipient[] {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(fields);
  const header = rows[0]?.map(value => value.toLowerCase());
  const phoneColumn = header?.findIndex(value => /^(telefone|phone|celular|whatsapp)$/.test(value)) ?? -1;
  const nameColumn = header?.findIndex(value => /^(nome|name)$/.test(value)) ?? -1;
  if (phoneColumn >= 0) rows.shift();
  return rows.map(row => {
    const phone = phoneColumn >= 0 ? row[phoneColumn] || "" : row[row.length - 1] || "";
    const name = phoneColumn >= 0 ? (nameColumn >= 0 ? row[nameColumn] : undefined) : row.length > 1 ? row[0] : undefined;
    return { phone, consent, ...(name ? { name } : {}) };
  });
}
