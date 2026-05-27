import { describe, expect, test } from 'bun:test';
import { specsConflict } from './spec-conflict';

describe('specsConflict', () => {
  describe('BTU (the case that motivated this)', () => {
    test('detects 12000 BTU vs 18000 BTU', () => {
      expect(
        specsConflict(
          'Ar Condicionado TCL Inverter 12000 BTU',
          'Ar Condicionado TCL Inverter 18000 BTU',
        ),
      ).toBe(true);
    });

    test('tolerates pt-BR thousand-separator format', () => {
      expect(
        specsConflict(
          'Ar Condicionado TCL Inverter 12000 BTU',
          'Ar Condicionado TCL Inverter 12.000 BTU',
        ),
      ).toBe(false);
    });
  });

  describe('GPU model', () => {
    test('detects RTX 5050 vs RTX 5060', () => {
      expect(
        specsConflict(
          'Placa de Vídeo MSI RTX 5050 Gaming OC',
          'Placa de Vídeo MSI RTX 5060 Gaming OC',
        ),
      ).toBe(true);
    });

    test('detects different GPU lines (GTX vs RTX with different numbers)', () => {
      expect(
        specsConflict('Placa de Vídeo RTX 5060', 'Placa de Vídeo GTX 1660'),
      ).toBe(true);
    });

    test('tolerates missing whitespace ("RTX5060" == "RTX 5060")', () => {
      expect(
        specsConflict('Placa MSI RTX 5060 8GB', 'Placa MSI RTX5060 8GB'),
      ).toBe(false);
    });
  });

  describe('Storage (GB/TB)', () => {
    test('detects iPhone 256GB vs iPhone 512GB', () => {
      expect(specsConflict('iPhone 15 256GB', 'iPhone 15 512GB')).toBe(true);
    });

    test('tolerates optional space ("256GB" == "256 GB")', () => {
      expect(specsConflict('iPhone 15 256GB', 'iPhone 15 256 GB')).toBe(false);
    });

    test('does not flag asymmetric mention (one side omits the spec)', () => {
      // "iPhone 15" doesn't mention storage; "iPhone 15 256GB" does.
      // This is the same product, just less specifically labeled.
      expect(specsConflict('iPhone 15', 'iPhone 15 256GB')).toBe(false);
    });
  });

  describe('Screen size', () => {
    test('detects 27 polegadas vs 32 polegadas', () => {
      expect(
        specsConflict('Monitor Gamer 27 polegadas IPS', 'Monitor Gamer 32 polegadas IPS'),
      ).toBe(true);
    });

    test('detects mixed units (27" vs 32 pol)', () => {
      expect(specsConflict('TV 27"', 'TV 32 pol')).toBe(true);
    });
  });

  describe('multi-spec strings', () => {
    test('one matching spec is not enough to escape a conflicting one', () => {
      // Both have "256GB" (storage) but different RAM (8 vs 16 — both also captured as GB).
      // The conflict detector groups all GB values together, so the differing RAM
      // value still flags this as a different product.
      expect(
        specsConflict(
          'Notebook Dell 8GB RAM 256GB SSD',
          'Notebook Dell 16GB RAM 256GB SSD',
        ),
      ).toBe(true);
    });

    test('all specs equal across both sides → no conflict', () => {
      expect(
        specsConflict(
          'Notebook Dell 8GB RAM 256GB SSD',
          'Notebook Dell Inspiron 8GB RAM 256GB SSD',
        ),
      ).toBe(false);
    });
  });

  describe('battery / power / camera / frequency', () => {
    test('detects mAh mismatch', () => {
      expect(specsConflict('Bateria Anker 5000 mAh', 'Bateria Anker 10000 mAh')).toBe(true);
    });

    test('detects watts mismatch', () => {
      expect(specsConflict('Fonte Corsair 750W', 'Fonte Corsair 850W')).toBe(true);
    });

    test('detects megapixel mismatch', () => {
      expect(specsConflict('Samsung S24 50MP', 'Samsung S24 200MP')).toBe(true);
    });

    test('detects refresh rate mismatch (Hz)', () => {
      expect(specsConflict('Monitor 144Hz', 'Monitor 240Hz')).toBe(true);
    });
  });

  describe('no false positives', () => {
    test('strings with no recognizable specs do not conflict', () => {
      expect(specsConflict('Camisa Térmica Voker', 'Camisa Térmica Voker Segunda Pele')).toBe(false);
    });

    test('identical strings never conflict', () => {
      const name = 'Notebook Yoga Slim 7i Intel Core Ultra 5, 16GB, 512GB SSD';
      expect(specsConflict(name, name)).toBe(false);
    });

    test('bare numbers without recognized units are ignored', () => {
      // "Pichau Athen V3" — number is part of a model name, not a unit-bearing spec.
      expect(
        specsConflict('Monitor Gamer Pichau Athen V3', 'Monitor Gamer Pichau Athen V4'),
      ).toBe(false);
    });
  });
});
