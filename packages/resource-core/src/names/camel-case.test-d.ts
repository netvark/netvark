import type { CAMEL_CASES } from '../test-support/camel-cases';
import type { CamelCase } from './camel-case';

import { describe, expectTypeOf, it } from 'vitest';

type Case = (typeof CAMEL_CASES)[number];

/** A case `CamelCase` gets wrong, as `[input, expected, actual]`. */
type Mismatch<TCase> = TCase extends readonly [
  infer TInput extends string,
  infer TOutput extends string,
]
  ? [CamelCase<TInput>, TOutput] extends [TOutput, CamelCase<TInput>]
    ? never
    : readonly [TInput, TOutput, CamelCase<TInput>]
  : never;

describe('CamelCase, the type-level twin of toCamelCase (SPEC 4.1, 4.3)', () => {
  it('matches toCamelCase on every case of the table', () => {
    expectTypeOf<Case>().not.toBeNever();
    expectTypeOf<Mismatch<Case>>().toBeNever();
  });

  it('is string for a name typed only as string', () => {
    expectTypeOf<CamelCase<string>>().toEqualTypeOf<string>();
  });

  it('converts a 63-character identifier, the PostgreSQL maximum', () => {
    expectTypeOf<
      CamelCase<'a_b_c_d_e_f_g_h_i_j_k_l_m_n_o_p_q_r_s_t_u_v_w_x_y_z_0_1_2_3_4_5'>
    >().toEqualTypeOf<'aBCDEFGHIJKLMNOPQRSTUVWXYZ012345'>();
  });
});
