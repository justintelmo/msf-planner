import { describe, expect, it } from 'vitest';
import { API_PATHS, fillTemplate, matchTemplate, smallestParams } from './params';

describe('API parameter docs', () => {
  it('matches a concrete path to its documented template', () => {
    expect(matchTemplate('/game/v1/upgradeData/iso8FuseCosts')).toEqual({
      template: '/game/v1/upgradeData/{fieldId}', values: { fieldId: 'iso8FuseCosts' },
    });
    expect(fillTemplate('/game/v1/upgradeData/{fieldId}', { fieldId: 'iso8FuseCosts' })).toBe('/game/v1/upgradeData/iso8FuseCosts');
  });

  it('offers only the documented size-reducing settings', () => {
    expect(smallestParams(API_PATHS['/game/v1/upgradeData/{fieldId}'])).toEqual({
      lang: 'none', itemFormat: 'id', pieceInfo: 'none', pieceDirectCost: 'none', pieceFlatCost: 'none', subPieceInfo: 'none',
    });
  });
});
