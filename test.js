const crypto = require('crypto')
const { sep } = require('path')
const { tmpdir } = require('os')
const { writeFileSync, unlinkSync, readFileSync } = require('fs')
const t = require('tap')
const doctrine = require('doctrine')
const unified = require('unified')
const jsdocCommentsFromCode = require('./lib/jsdocCommentsFromCode')
const getJsdocAstTag = require('./lib/getJsdocAstTag')
const getJsdocAstTags = require('./lib/getJsdocAstTags')
const deconstructJsdocNamepath = require('./lib/deconstructJsdocNamepath')
const jsdocAstToMember = require('./lib/jsdocAstToMember')
const membersToOutline = require('./lib/membersToOutline')
const mdToMdAst = require('./lib/mdToMdAst')
const typeJsdocAstToMdAst = require('./lib/typeJsdocAstToMdAst')
const membersToMdAst = require('./lib/membersToMdAst')
const remarkPluginReplaceSection = require('./lib/remarkPluginReplaceSection')
const mdFileReplaceSection = require('./lib/mdFileReplaceSection')
const jsdocMd = require('./lib/jsdocMd')

/**
 * Creates a temporary file that deletes at test teardown.
 * @kind function
 * @name createTestFile
 * @param {string} content File content.
 * @param {string} extension File extension.
 * @param {Object} t TAP test context.
 * @returns {string} File path.
 * @ignore
 */
function createTestFile(content, extension, t) {
  const path = `${tmpdir()}${sep}jsdoc-md-test-${crypto
    .randomBytes(16)
    .toString('hex')}.${extension}`

  writeFileSync(path, content)

  // Make sure that the temp file is removed after the test.
  t.tearDown(() => {
    try {
      unlinkSync(path)
    } catch (error) {
      // Ignore the error if there is no file to clean up.
      if (error.code !== 'ENOENT') throw error
    }
  })

  return path
}

t.test('jsdocCommentsFromCode', t => {
  t.matchSnapshot(
    JSON.stringify(
      jsdocCommentsFromCode(
        `
/**
* a
*/
let a

/** b */
let b

const c = '/** c */'

/* d */

/*
e
*/

// f
`
      ),
      null,
      2
    ),
    'JSDoc comments.'
  )
  t.end()
})

t.test('getJsdocAstTag', t => {
  t.equal(
    getJsdocAstTag(doctrine.parse('').tags, 'name'),
    undefined,
    'Tag missing.'
  )

  const expectedTag = { title: 'name', description: null, name: 'a' }

  t.deepEqual(
    getJsdocAstTag(doctrine.parse('@name a').tags, 'name'),
    expectedTag,
    '@name a.'
  )

  t.deepEqual(
    getJsdocAstTag(
      doctrine.parse(
        `@name b
         @name a`
      ).tags,
      'name'
    ),
    expectedTag,
    'Tag override.'
  )

  t.end()
})

t.test('getJsdocAstTags', t => {
  t.equal(
    getJsdocAstTags(doctrine.parse('').tags, 'param'),
    undefined,
    'Tags missing.'
  )

  t.deepEqual(
    getJsdocAstTags(
      doctrine.parse(
        `Description.
         @kind function
         @name a
         @param {string} a Description.
         @param {string} b Description.`
      ).tags,
      'param'
    ),
    [
      {
        title: 'param',
        description: 'Description.',
        type: { type: 'NameExpression', name: 'string' },
        name: 'a'
      },
      {
        title: 'param',
        description: 'Description.',
        type: { type: 'NameExpression', name: 'string' },
        name: 'b'
      }
    ],
    '@param.'
  )

  t.end()
})

t.test('deconstructJsdocNamepath', t => {
  t.deepEqual(
    deconstructJsdocNamepath('a'),
    {
      memberof: undefined,
      membership: undefined,
      name: 'a'
    },
    'No nested members.'
  )

  t.deepEqual(
    deconstructJsdocNamepath('a.b#c~d'),
    {
      memberof: 'a.b#c',
      membership: '~',
      name: 'd'
    },
    'Nested static, instance and inner members.'
  )

  // Invalid namepaths.
  ;['', 'a..b', 'a..b.c', 'a.'].forEach(namepath => {
    t.throws(
      () => deconstructJsdocNamepath(namepath),
      new Error(`Invalid JSDoc namepath “${namepath}”.`),
      'Throws'
    )
  })

  t.end()
})

t.test('jsdocAstToMember', t => {
  t.equals(jsdocAstToMember(doctrine.parse('@ignore')), undefined, '@ignore.')
  t.equals(
    jsdocAstToMember(doctrine.parse('')),
    undefined,
    'Required tags missing.'
  )
  t.matchSnapshot(
    JSON.stringify(
      jsdocAstToMember(
        doctrine.parse(
          `Description.
           @kind function
           @name A#b
           @param {number} a Description.`
        )
      ),
      null,
      2
    ),
    'A method.'
  )
  t.end()
})

t.test('membersToOutline', t => {
  const members = [
    `Description.
     @kind class
     @name A
     @param {A} a Description.`,

    `Description.
     @kind function
     @name A#methodName1
     @param {A} a Description.`,

    `Description.
     @kind function
     @name A#methodName2
     @param {A} a Description.`,

    `Description.
     @kind function
     @name A~methodName3
     @ignore`
  ].reduce((members, doclet) => {
    const member = jsdocAstToMember(doctrine.parse(doclet))
    if (member) members.push(member)
    return members
  }, [])

  t.matchSnapshot(
    JSON.stringify(membersToOutline(members), null, 2),
    'Outline.'
  )

  t.end()
})

t.test('mdToMdAst', t => {
  t.matchSnapshot(
    JSON.stringify(mdToMdAst('[a](https://npm.im/jsdoc-md)'), null, 2),
    'Markdown AST.'
  )
  t.end()
})

t.test('membersToMdAst', t => {
  const members = [
    `Description.
     @kind typedef
     @name A
     @prop {string} a Description.
     @prop {boolean|string} b Description.`,

    `Description.
     @kind constant
     @name B
     @type {string}`,

    `Description.
     @kind class
     @name C
     @param {A} a Description.`,

    `Description.
     @kind function
     @name C.a
     @param {string} a Description.
     @param {string} b Description.`,

    `Description.
     @kind function
     @name C#b
     @param {string} a Description.`,

    `Description.
     @kind function
     @name C~c
     @param {string} a Description.`,

    `Description.
     @kind function
     @name C~d
     @ignore`,

    `Description.
     @kind member
     @name C.e
     @type {string}`,

    `Description.
     @kind function
     @name d
     @param {string} a Description.`
  ].reduce((members, doclet) => {
    const member = jsdocAstToMember(doctrine.parse(doclet))
    if (member) members.push(member)
    return members
  }, [])

  t.matchSnapshot(
    JSON.stringify(membersToMdAst(members, 3), null, 2),
    'Markdown.'
  )

  t.end()
})

t.test('remarkPluginReplaceSection', t => {
  t.deepEqual(
    unified()
      .use(remarkPluginReplaceSection, {
        targetHeading: 'A',
        replacementAst: {
          type: 'root',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: 'Replaced.'
                }
              ]
            }
          ]
        }
      })
      .runSync({
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 1,
            children: [
              {
                type: 'text',
                value: 'A'
              }
            ]
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: 'Replace.'
              }
            ]
          },
          {
            type: 'heading',
            depth: 1,
            children: [
              {
                type: 'text',
                value: 'B'
              }
            ]
          }
        ]
      }),
    {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [
            {
              type: 'text',
              value: 'A'
            }
          ]
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: 'Replaced.'
            }
          ]
        },
        {
          type: 'heading',
          depth: 1,
          children: [
            {
              type: 'text',
              value: 'B'
            }
          ]
        }
      ]
    },
    'Options.'
  )

  t.deepEqual(
    unified()
      .use(remarkPluginReplaceSection)
      .runSync({
        type: 'root',
        children: [
          {
            type: 'heading',
            depth: 1,
            children: [
              {
                type: 'text',
                value: 'API'
              }
            ]
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                value: 'Replace.'
              }
            ]
          }
        ]
      }),
    {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [
            {
              type: 'text',
              value: 'API'
            }
          ]
        }
      ]
    },
    'Defaults.'
  )

  t.throws(
    () =>
      unified()
        .use(remarkPluginReplaceSection)
        .runSync({
          type: 'root',
          children: []
        }),
    new Error('Missing target heading “API”.'),
    'Missing target heading.'
  )

  t.end()
})

t.test('mdFileReplaceSection', t => {
  const markdownPath = createTestFile(
    `# Preserve

## Target

Replace.

## Preserve
`,
    'md',
    t
  )

  mdFileReplaceSection({
    markdownPath,
    targetHeading: 'Target',
    replacementAst: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: 'Replaced.'
            }
          ]
        }
      ]
    }
  })

  const fileReplacedContent = readFileSync(markdownPath, { encoding: 'utf8' })

  t.equal(
    fileReplacedContent,
    `# Preserve

## Target

Replaced.

## Preserve
`,
    'File content.'
  )

  t.end()
})

t.test('jsdocMd', t => {
  const sourceGlob = createTestFile(
    `
/**
 * Description.
 * @kind constant
 * @name A
 * @type {boolean}
 */
const A = true

/**
 * Description, here is a **bold** word.
 * @kind class
 * @name B
 * @param {boolean} [a] Description, here is a **bold** word.
 * @example <caption>Construct a new instance, here is a **bold** word.</caption>
 * \`\`\`js
 * const b = new B()
 * \`\`\`
 * @example <caption>Construct a new instance with options.</caption>
 * \`\`\`js
 * const b = new B(true)
 * \`\`\`
 */
class B {
  /**
   * Description.
   * @kind typedef
   * @name B~A
   * @prop {string} a Description, here is a **bold** word.
   * @prop {boolean} b Description.
   */

  /**
   * Description.
   * @kind member
   * @name B.b
   */
  static b = ''

  /**
   * Description.
   * @kind member
   * @name B#c
   */
  c = ''

  /**
   * Description.
   * @kind function
   * @name B.d
   * @param {B~A} a Description.
   * @param {boolean} [b=true] Description.
   */
  static d(a, b = true) {}

  /**
   * Description.
   * @kind function
   * @name B#e
   */
  e() {}
}

/**
 * Description.
 * @kind function
 * @name c
 * @param {string} a Description.
 * @see [jsdoc-md on Github](https://github.com/jaydenseric/jsdoc-md).
 * @see [jsdoc-md on npm](https://npm.im/jsdoc-md).
 */
function c(a) {}
`,
    'js',
    t
  )

  const markdownPath = createTestFile(
    `# Preserve

## Target

Replace.

## Preserve
`,
    'md',
    t
  )

  jsdocMd({ sourceGlob, markdownPath, targetHeading: 'Target' })

  const fileReplacedContent = readFileSync(markdownPath, { encoding: 'utf8' })

  t.matchSnapshot(fileReplacedContent, 'File content.')

  t.end()
})

t.test('typeJsdocAstToMdAst', t => {
  const typeMdAsts = [
    // Name expression.
    '@type {boolean}',
    '@type {number}',
    '@type {string}',
    '@type {Object}',
    '@type {Array}',

    // Union.
    '@type {string | number}',
    '@type {Object | boolean}',

    // Rest.
    '@param {...string} a',

    // Application.
    '@type {Array<string, number>}',

    // Record.
    '@type {{a: null, b: true}}',

    // Literal.
    '@type {*}',
    '@type {null}',
    '@type {undefined}',
    '@type {5}',
    '@type {""}',
    '@type {true}',
    '@type {false}',

    // Function.
    '@type {function()}',
    '@type {function(): number}',
    '@type {function(string, Object)}',
    '@type {function(string, number): Object}',
    '@type {function(new:Object)}',
    '@type {function(new:Object, ...string)}',
    '@type {function(new:Object, ...string): Object}',
    '@type {function(this:Object)}',
    '@type {function(this:Object, ...string)}',
    '@type {function(this:Object, ...string): Object}',
    '@type {function(string=, number=)}',
    '@type {function(string=, number=): Object}'
  ].map(doclet => typeJsdocAstToMdAst(doctrine.parse(doclet).tags[0].type))

  t.matchSnapshot(JSON.stringify(typeMdAsts, null, 2), 'Markdown ASTs.')
  t.end()
})
