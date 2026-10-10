/** The enums and domains of the unit-test catalog: those of the contacts application, plus `audit.operation` and the NOT NULL domain `required_note`. Not published with the package. */
export const ENUMS = {
  contact_kind: ['person', 'company'],
  phone_kind: ['mobile', 'landline', 'fax'],
  'audit.operation': ['insert', 'update', 'delete'],
} as const;

export const DOMAINS = {
  country_code: {
    schema: 'public',
    name: 'country_code',
    type: 'text',
    typeKind: 'base',
    array: false,
    sqlType: 'text',
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    constraints: {
      country_code_check: {
        kind: 'check',
        rule: {
          kind: 'pattern',
          source: '^[A-Z]{2}$',
          flags: 'su',
        },
      },
    },
  },
  email: {
    schema: 'public',
    name: 'email',
    type: 'citext',
    typeKind: 'base',
    array: false,
    sqlType: 'citext',
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    constraints: {
      email_check: {
        kind: 'check',
        rule: null,
      },
    },
  },
  percentage: {
    schema: 'public',
    name: 'percentage',
    type: 'numeric',
    typeKind: 'base',
    array: false,
    sqlType: 'numeric(5,2)',
    maxLength: null,
    precision: 5,
    scale: 2,
    nullable: true,
    default: null,
    constraints: {
      percentage_check: {
        kind: 'check',
        rule: {
          kind: 'range',
          min: {
            value: '0',
            inclusive: true,
          },
          max: {
            value: '100',
            inclusive: true,
          },
        },
      },
    },
  },
  short_text: {
    schema: 'public',
    name: 'short_text',
    type: 'varchar',
    typeKind: 'base',
    array: false,
    sqlType: 'character varying(120)',
    maxLength: 120,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    constraints: {
      short_text_check: {
        kind: 'check',
        rule: {
          kind: 'length',
          min: 1,
          max: 120,
        },
      },
    },
  },
  required_note: {
    schema: 'public',
    name: 'required_note',
    type: 'text',
    typeKind: 'base',
    array: false,
    sqlType: 'text',
    maxLength: null,
    precision: null,
    scale: null,
    nullable: true,
    default: null,
    constraints: {
      required_note_check: {
        kind: 'check',
        rule: {
          kind: 'notNull',
        },
      },
    },
  },
} as const;
