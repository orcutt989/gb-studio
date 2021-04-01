/* eslint-disable camelcase */
// import { DutyInstrument } from "./song/DutyInstrument";
import { DutyInstrument, NoiseInstrument, WaveInstrument } from "../../../store/features/tracker/trackerTypes";
import { PatternCell } from "./song/PatternCell";
import { Song } from "./song/Song";

interface InstrumentMap {
  [index: number]: number
}

export const loadUGESong = (data: ArrayBuffer): (Song | null) => {
  console.log(data);
  const song = new Song();

  // TODO: Sanity checks on data.
  // TODO: Use `DataView` object instead of loads of Uint32Arrays
  let offset = 0;
  const version = new Uint32Array(data.slice(offset, offset + 4))[0];
  console.log(`uge version: ${version}`);
  if (version < 0 || version > 3) return null;

  const uint8data = new Uint8Array(data);
  offset += 4;

  const td = new TextDecoder();
  song.name = td.decode(data.slice(offset + 1, offset + 1 + uint8data[offset]));
  offset += 256;
  song.artist = td.decode(data.slice(offset + 1, offset + 1 + uint8data[offset]));
  offset += 256;
  song.comment = td.decode(data.slice(offset + 1, offset + 1 + uint8data[offset]));
  offset += 256;

  const instrument_count = version < 3 ? 15 : 45;
  const duty_instrument_mapping: InstrumentMap = {};
  const wave_instrument_mapping: InstrumentMap = {};
  const noise_instrument_mapping: InstrumentMap = {};

  for (let n = 0; n < instrument_count; n++) {
    const type = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const name = td.decode(data.slice(offset + 1, offset + 1 + uint8data[offset]));
    offset += 256;

    let length = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const length_enabled = uint8data[offset];
    offset += 1;
    let initial_volume = uint8data[offset];
    if (initial_volume > 15) initial_volume = 15; // ??? bug in the song files?
    offset += 1;
    const volume_direction = uint8data[offset];
    offset += 4;
    let volume_sweep_amount = uint8data[offset];
    offset += 1;
    if (volume_sweep_amount !== 0)
      volume_sweep_amount = 8 - volume_sweep_amount
    if (volume_direction)
      volume_sweep_amount = -volume_sweep_amount;

    const freq_sweep_time = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const freq_sweep_direction = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    let freq_sweep_shift = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    if (freq_sweep_direction) {
      freq_sweep_shift = -freq_sweep_shift;
    }

    const duty = uint8data[offset];
    offset += 1;

    const wave_output_level = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const wave_waveform_index = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const noise_shift_clock_frequency = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const noise_counter_step = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    const noise_dividing_ratio = new Uint32Array(data.slice(offset, offset + 4))[0];
    offset += 4;
    // TODO: Unreleased V4 format has some kind of "noise macro" after this data, most likely 6 bytes or integers.

    if (type === 0) {
      length = 64 - length;
      if (length === 64) length = 0;

      const instr = {} as DutyInstrument;// new DutyInstrument(name);
      if (length_enabled) {
        instr.length = length;
      } else {
        instr.length = null;
      }

      instr.name = name;
      instr.duty_cycle = duty;
      instr.initial_volume = initial_volume;
      instr.volume_sweep_change = volume_sweep_amount;

      instr.frequency_sweep_time = freq_sweep_time;
      instr.frequency_sweep_shift = freq_sweep_shift;

      duty_instrument_mapping[(n % 15) + 1] = song.duty_instruments.length;
      song.addDutyInstrument(instr);
    } else if (type === 1) {
      length = 256 - length;
      if (length === 256) length = 0;

      const instr = {} as WaveInstrument;
      if (length_enabled) {
        instr.length = length;
      } else {
        instr.length = null;
      }

      instr.name = name;
      instr.volume = wave_output_level;
      instr.wave_index = wave_waveform_index;

      wave_instrument_mapping[(n % 15) + 1] = song.wave_instruments.length;
      song.addWaveInstrument(instr);
    } else if (type === 2) {
      length = 64 - length;
      if (length === 64) length = 0;

      const instr = {} as NoiseInstrument;
      if (length_enabled) {
        instr.length = length;
      } else {
        instr.length = null;
      }

      instr.name = name;
      instr.initial_volume = initial_volume;
      instr.volume_sweep_change = volume_sweep_amount;

      instr.shift_clock_mask = noise_shift_clock_frequency;
      instr.dividing_ratio = noise_dividing_ratio;
      instr.bit_count = noise_counter_step ? 7 : 15;

      noise_instrument_mapping[(n % 15) + 1] = song.noise_instruments.length;
      song.addNoiseInstrument(instr);
    } else {
      console.log(n, name, type);
    }
  }
  for (let n = 0; n < 16; n++) {
    song.waves.push(Uint8Array.from(uint8data.slice(offset, offset + 32)));
    offset += 32;
    if (version < 3)
      offset += 1; // older versions have an off-by-one error
  }

  song.ticks_per_row = new Uint32Array(data.slice(offset, offset + 4))[0];
  offset += 4;

  const pattern_count = new Uint32Array(data.slice(offset, offset + 4))[0];
  if (offset + pattern_count * 13 * 64 > data.byteLength) return null;
  offset += 4;
  const patterns = []
  for (let n = 0; n < pattern_count; n++) {
    const pattern = []
    for (let m = 0; m < 64; m++) {
      const [note, instrument, effectcode] = new Int32Array(data.slice(offset, offset + 12));
      offset += 12;
      const effectparam = uint8data[offset];
      offset += 1;

      pattern.push([note, instrument, effectcode, effectparam]);
    }
    patterns.push(pattern);
  }

  const orders = []
  for (let n = 0; n < 4; n++) {
    const order_count = new Uint32Array(data.slice(offset, offset + 4))[0]; // The amount of pattern orders stored in the file has an off-by-one.
    offset += 4;
    orders.push(new Uint32Array(data.slice(offset, offset + 4 * (order_count - 1))));
    offset += 4 * order_count;
  }
  // TODO: If version > 1 then custom routines follow.

  // Create proper flat patterns
  for (let n = 0; n < orders[0].length; n++) {
    const pattern = []
    for (let m = 0; m < 64; m++) {
      const row = []
      for (let track = 0; track < 4; track++) {
        const [note, instrument, effectcode, effectparam] = patterns[orders[track][n]][m];
        const cell = new PatternCell();
        if (note !== 90)
          cell.note = note;
        if (instrument !== 0) {
          let mapping: InstrumentMap = {};
          if (track < 2) mapping = duty_instrument_mapping;
          if (track === 2) mapping = wave_instrument_mapping;
          if (track === 3) mapping = noise_instrument_mapping;
          if (instrument in mapping)
            cell.instrument = mapping[instrument];
        }
        if (effectcode !== 0 || effectparam !== 0) {
          cell.effectcode = effectcode;
          cell.effectparam = effectparam;
        }
        row.push(cell);
      }
      pattern.push(row);
    }
    song.patterns.push(pattern);
    let added = false;
    for (let idx = 0; idx < song.patterns.length - 1; idx++) {
      if (song.patternEqual(idx, song.patterns.length - 1)) {
        song.sequence.push(idx);
        song.patterns.pop()
        added = true;
      }
    }
    if (!added)
      song.sequence.push(song.patterns.length - 1);
  }

  // TODO: Remove unused instruments, unused waves, and deduplicate patterns.
  // for (let idx = 0; idx < song.duty_instruments.length;) {
  //   if (!song.usesInstrument("duty", idx))
  //     song.removeInstrument("duty", idx);
  //   else
  //     idx += 1;
  // }
  // for (let idx = 0; idx < song.wave_instruments.length;) {
  //   if (!song.usesInstrument("wave", idx))
  //     song.removeInstrument("wave", idx);
  //   else
  //     idx += 1;
  // }
  // for (let idx = 0; idx < song.noise_instruments.length;) {
  //   if (!song.usesInstrument("noise", idx))
  //     song.removeInstrument("noise", idx);
  //   else
  //     idx += 1;
  // }

  console.log(song);
  return song;
}

export const saveUGESong = (song: Song): ArrayBuffer => {
  const buffer = new ArrayBuffer(1024 * 1024);
  const view = new DataView(buffer);
  let idx = 0;

  function addUint8(value: number) {
    view.setUint8(idx, value);
    idx += 1;
  }
  function addUint32(value: number) {
    view.setUint32(idx, value, true);
    idx += 4;
  }
  function addShortString(s: string) {
    view.setUint8(idx, s.length);
    idx += 1;
    const te = new TextEncoder()
    te.encodeInto(s, new Uint8Array(buffer, idx, idx + 255));
    idx += 255;
  }
  function addDutyInstrument(type: number, i: DutyInstrument) {
    addUint32(type);

    addShortString(i.name || "");
    addUint32(i.length ? i.length : 0);
    addUint8(i.length === null ? 0 : 1);
    addUint8(i.initial_volume);
    addUint32(i.volume_sweep_change < 0 ? 1 : 0);
    addUint8(i.volume_sweep_change !== 0 ? 8 - Math.abs(i.volume_sweep_change) : 0);

    addUint32(i.frequency_sweep_time);
    addUint32(i.frequency_sweep_shift < 0 ? 1 : 0);
    addUint32(i.frequency_sweep_shift);

    addUint8(i.duty_cycle);

    addUint32(0);
    addUint32(0);

    addUint32(0);
    addUint32(0);
    addUint32(0);
  }

  function addWaveInstrument(type: number, i: WaveInstrument) {
    addUint32(type);

    addShortString(i.name || "");
    addUint32(i.length ? i.length : 0);
    addUint8(i.length === null ? 0 : 1);
    addUint8(0);
    addUint32(0);
    addUint8(0);

    addUint32(0);
    addUint32(0);
    addUint32(0);

    addUint8(0);

    addUint32(i.volume);
    addUint32(i.wave_index);

    addUint32(0);
    addUint32(0);
    addUint32(0);
  }

  function addNoiseInstrument(type: number, i: NoiseInstrument) {
    addUint32(type);

    addShortString(i.name || "");
    addUint32(i.length ? i.length : 0);
    addUint8(i.length === null ? 0 : 1);
    addUint8(i.initial_volume);
    addUint32(i.volume_sweep_change < 0 ? 1 : 0);
    addUint8(i.volume_sweep_change !== 0 ? 8 - Math.abs(i.volume_sweep_change) : 0);

    addUint32(0);
    addUint32(0);
    addUint32(0);

    addUint8(0);

    addUint32(0);
    addUint32(0);

    addUint32(0);
    addUint32(i.dividing_ratio);
    addUint32(i.bit_count === 7 ? 1 : 0);
  }

  addUint32(3); // version
  addShortString(song.name);
  addShortString(song.artist);
  addShortString(song.comment);

  for (let n = 0; n < 15; n++) {
    addDutyInstrument(0, song.duty_instruments[n] || {});
  }
  for (let n = 0; n < 15; n++) {
    addWaveInstrument(1, song.wave_instruments[n] || {});
  }
  for (let n = 0; n < 15; n++) {
    addNoiseInstrument(2, song.noise_instruments[n] || {});
  }
  for (let n = 0; n < 16; n++) {
    for (let m = 0; m < 32; m++) {
      addUint8(song.waves[n] ? song.waves[n][m] : 0);
    }
  }
  addUint32(song.ticks_per_row);

  addUint32(song.patterns.length * 4);
  for (const pattern of song.patterns) {
    for (let track = 0; track < 4; track++) {
      for (let m = 0; m < 64; m++) {
        const t = pattern[m][track];
        addUint32(t.note === null ? 90 : t.note);
        addUint32(t.instrument === null ? 0 : t.instrument + 1);
        addUint32(t.effectcode === null ? 0 : t.effectcode);
        addUint8(t.effectparam === null ? 0 : t.effectparam);
      }
    }
  }
  for (let track = 0; track < 4; track++) {
    addUint32(song.sequence.length + 1); //amount of "orders" in a uge file has an off-by-one
    for (const i of song.sequence) {
      addUint32(i * 4 + track);
    }
    addUint32(0); // add the off-by-one error
  }
  for (let n = 0; n < 16; n++) {
    addUint32(0); //Add empty routines
  }

  console.log(buffer.slice(0, idx));
  return buffer.slice(0, idx);
}