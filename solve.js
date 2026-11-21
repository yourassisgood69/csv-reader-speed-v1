// Fast drop-in replacement for csv-reader 1.0.0.
//
// Reads broken CSV text exactly as csv-reader does, in one left-to-right
// pass. The common case -- a plain unquoted field ended by a comma or a
// line break -- is handled by jumping straight to the next delimiter with
// the engine's native substring search instead of stepping character by
// character; the slow character work only happens for quoted fields and
// for the rare broken bits (stray carriage returns, doubled quotes,
// line breaks inside quotes, junk after a closing quote).
//
// Input:  { text, header }  -- text is the CSV text, header says whether
//         the first record is a header.
// Output: { columns, rows, errors }.
//   columns is the first record when header is true, else null.
//   rows holds the records after the first one when header is true, and
//   every record when it is false. Every row is padded with empty strings
//   or cut down to the first record's width.
//   errors are { code, line, row } objects (short_row also carries
//   fields, long_row also carries extra), in the order they are met.
//   line is the 1-based line the record starts on; row is the record's
//   index inside rows, null for the header record.

export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let recIdx = 0; // records completed so far
  let line = 1; // line number of the line currently being scanned
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1; // drop a leading BOM

  while (true) {
    // Skip lines left with no characters: they are no record at all.
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10) { i++; line++; }
      else if (c === 13 && text.charCodeAt(i + 1) === 10) { i += 2; line++; }
      else break;
    }
    if (i >= n) break;

    const recordLine = line;
    // Row index of this record inside rows (null for the header record).
    const row = recIdx === 0 ? (header ? null : 0) : (header ? recIdx - 1 : recIdx);
    const fields = [];
    let recDone = false;
    let eof = false;

    while (!recDone) {
      if (i >= n) {
        // A trailing comma left one last empty field, then the text ends.
        fields.push('');
        eof = true;
        recDone = true;
        break;
      }

      let f;
      let endKind; // 0 = comma, 1 = line break, 2 = end of text

      if (text.charCodeAt(i) === 34) {
        // ---- Quoted field: opens with a double quote. ----
        let close = -1;
        let esc = false;
        let p = i + 1;
        while (true) {
          const q = text.indexOf('"', p);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) { esc = true; p = q + 2; continue; }
          close = q;
          break;
        }

        if (close === -1) {
          // No closing quote anywhere: the quote is a literal character
          // and the text after it is read again as if it were unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row });
          const pp = i + 1;
          const ci = text.indexOf(',', pp);
          const li = text.indexOf('\n', pp);
          let end;
          let kind;
          if (ci === -1 && li === -1) { end = n; kind = 2; }
          else if (li === -1 || (ci !== -1 && ci < li)) { end = ci; kind = 0; }
          else { end = li; kind = 1; }
          let s = text.slice(pp, end);
          if (kind === 1 && s.charCodeAt(s.length - 1) === 13) s = s.slice(0, -1);
          if (s.indexOf('\r') === -1) {
            f = '"' + s;
            i = kind === 2 ? n : end + 1;
            if (kind === 1) line++;
            endKind = kind;
          } else {
            // Rare: stray carriage returns in the re-read text.
            const parts = ['"'];
            let q2 = pp;
            while (true) {
              const c2 = text.indexOf(',', q2);
              const l2 = text.indexOf('\n', q2);
              let e2;
              let k2;
              if (c2 === -1 && l2 === -1) { e2 = n; k2 = 2; }
              else if (l2 === -1 || (c2 !== -1 && c2 < l2)) { e2 = c2; k2 = 0; }
              else { e2 = l2; k2 = 1; }
              let s2 = text.slice(q2, e2);
              if (k2 === 1 && s2.charCodeAt(s2.length - 1) === 13) s2 = s2.slice(0, -1);
              const rr = s2.indexOf('\r');
              if (rr === -1) {
                parts.push(s2);
                i = k2 === 2 ? n : e2 + 1;
                if (k2 === 1) line++;
                endKind = k2;
                break;
              }
              parts.push(s2.slice(0, rr));
              errors.push({ code: 'stray_cr', line: recordLine, row });
              q2 = q2 + rr + 1;
            }
            f = parts.join('');
          }
        } else {
          // A closing quote was found.
          let val;
          if (!esc) {
            val = text.slice(i + 1, close);
            if (val.indexOf('\n') !== -1 || val.indexOf('\r') !== -1) {
              // Line breaks inside quotes read as LF and count as lines.
              let out = '';
              let seg = 0;
              for (let k = 0; k < val.length; k++) {
                const c = val.charCodeAt(k);
                if (c === 13) {
                  out += val.slice(seg, k) + '\n';
                  line++;
                  seg = k + 1;
                  if (val.charCodeAt(k + 1) === 10) { k++; seg = k + 1; }
                } else if (c === 10) {
                  out += val.slice(seg, k) + '\n';
                  line++;
                  seg = k + 1;
                }
              }
              out += val.slice(seg);
              val = out;
            }
          } else {
            // Doubled quotes and/or line breaks inside the field.
            const parts = [];
            let seg = i + 1;
            let k = i + 1;
            while (k < close) {
              const c = text.charCodeAt(k);
              if (c === 34) {
                parts.push(text.slice(seg, k));
                parts.push('"');
                k += 2;
                seg = k;
              } else if (c === 13) {
                parts.push(text.slice(seg, k));
                parts.push('\n');
                line++;
                k++;
                if (text.charCodeAt(k) === 10) k++;
                seg = k;
              } else if (c === 10) {
                parts.push(text.slice(seg, k));
                parts.push('\n');
                line++;
                k++;
                seg = k;
              } else {
                k++;
              }
            }
            parts.push(text.slice(seg, close));
            val = parts.join('');
          }

          // What follows the closing quote, up to the next comma or
          // line break, is appended as it stands (quote junk).
          const j = close + 1;
          const ci = text.indexOf(',', j);
          const li = text.indexOf('\n', j);
          let end;
          let kind;
          if (ci === -1 && li === -1) { end = n; kind = 2; }
          else if (li === -1 || (ci !== -1 && ci < li)) { end = ci; kind = 0; }
          else { end = li; kind = 1; }
          let junk = text.slice(j, end);
          if (kind === 1 && junk.charCodeAt(junk.length - 1) === 13) junk = junk.slice(0, -1);
          if (junk.indexOf('\r') === -1) {
            if (junk.length > 0) {
              val += junk;
              errors.push({ code: 'quote_junk', line: recordLine, row });
            }
            i = kind === 2 ? n : end + 1;
            if (kind === 1) line++;
            endKind = kind;
          } else {
            // Rare: stray carriage returns inside the junk.
            const parts = [val];
            let junkLen = 0;
            let q2 = j;
            while (true) {
              const c2 = text.indexOf(',', q2);
              const l2 = text.indexOf('\n', q2);
              let e2;
              let k2;
              if (c2 === -1 && l2 === -1) { e2 = n; k2 = 2; }
              else if (l2 === -1 || (c2 !== -1 && c2 < l2)) { e2 = c2; k2 = 0; }
              else { e2 = l2; k2 = 1; }
              let s2 = text.slice(q2, e2);
              if (k2 === 1 && s2.charCodeAt(s2.length - 1) === 13) s2 = s2.slice(0, -1);
              const rr = s2.indexOf('\r');
              if (rr === -1) {
                parts.push(s2);
                junkLen += s2.length;
                i = k2 === 2 ? n : e2 + 1;
                if (k2 === 1) line++;
                endKind = k2;
                break;
              }
              parts.push(s2.slice(0, rr));
              junkLen += rr;
              errors.push({ code: 'stray_cr', line: recordLine, row });
              q2 = q2 + rr + 1;
            }
            if (junkLen > 0) errors.push({ code: 'quote_junk', line: recordLine, row });
            val = parts.join('');
          }
          f = val;
        }
      } else {
        // ---- Unquoted field: jump to the next comma or line break. ----
        // A quote inside an unquoted field is an ordinary character.
        const ci = text.indexOf(',', i);
        const li = text.indexOf('\n', i);
        let end;
        let kind;
        if (ci === -1 && li === -1) { end = n; kind = 2; }
        else if (li === -1 || (ci !== -1 && ci < li)) { end = ci; kind = 0; }
        else { end = li; kind = 1; }
        let s = text.slice(i, end);
        if (kind === 1 && s.charCodeAt(s.length - 1) === 13) s = s.slice(0, -1);
        if (s.indexOf('\r') === -1) {
          f = s;
          i = kind === 2 ? n : end + 1;
          if (kind === 1) line++;
          endKind = kind;
        } else {
          // Rare: a carriage return not followed by a line feed is
          // dropped, and the field carries on after it.
          const parts = [];
          let q2 = i;
          while (true) {
            const c2 = text.indexOf(',', q2);
            const l2 = text.indexOf('\n', q2);
            let e2;
            let k2;
            if (c2 === -1 && l2 === -1) { e2 = n; k2 = 2; }
            else if (l2 === -1 || (c2 !== -1 && c2 < l2)) { e2 = c2; k2 = 0; }
            else { e2 = l2; k2 = 1; }
            let s2 = text.slice(q2, e2);
            if (k2 === 1 && s2.charCodeAt(s2.length - 1) === 13) s2 = s2.slice(0, -1);
            const rr = s2.indexOf('\r');
            if (rr === -1) {
              parts.push(s2);
              i = k2 === 2 ? n : e2 + 1;
              if (k2 === 1) line++;
              endKind = k2;
              break;
            }
            parts.push(s2.slice(0, rr));
            errors.push({ code: 'stray_cr', line: recordLine, row });
            q2 = q2 + rr + 1;
          }
          f = parts.join('');
        }
      }

      fields.push(f);
      if (endKind === 1) recDone = true;
      else if (endKind === 2) { recDone = true; eof = true; }
    }

    // The record is complete: bring it to the first record's width.
    if (recIdx === 0) {
      width = fields.length;
      if (header) columns = fields;
      else rows.push(fields);
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        const extra = fields.slice(width);
        errors.push({ code: 'long_row', line: recordLine, row, extra });
        fields.length = width;
      }
      rows.push(fields);
    }
    recIdx++;
    if (eof) break;
  }

  if (header && columns === null) columns = [];
  return { columns, rows, errors };
}
