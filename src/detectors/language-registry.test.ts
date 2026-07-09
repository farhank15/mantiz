import { describe, it, expect } from 'vitest'
import { detectLanguage, isTestFile, isSourceFile } from './language-registry'

describe('language-registry', () => {

  describe('detectLanguage', () => {
    it('detects JavaScript by extension', () => {
      expect(detectLanguage('src/foo.js')).toBe('javascript')
      expect(detectLanguage('src/foo.jsx')).toBe('javascript')
    })

    it('detects TypeScript by extension', () => {
      expect(detectLanguage('src/foo.ts')).toBe('javascript')
      expect(detectLanguage('src/foo.tsx')).toBe('javascript')
    })

    it('detects Python by extension', () => {
      expect(detectLanguage('src/foo.py')).toBe('python')
    })

    it('detects Go by extension', () => {
      expect(detectLanguage('src/foo.go')).toBe('go')
    })

    it('detects Java by extension', () => {
      expect(detectLanguage('src/FooTest.java')).toBe('java')
    })

    it('detects Ruby by extension', () => {
      expect(detectLanguage('spec/foo_spec.rb')).toBe('ruby')
    })

    it('detects Rust by extension', () => {
      expect(detectLanguage('src/main.rs')).toBe('rust')
    })

    it('detects PHP by extension', () => {
      expect(detectLanguage('src/FooTest.php')).toBe('php')
    })

    it('returns null for unknown extensions', () => {
      expect(detectLanguage('foo.txt')).toBeNull()
      expect(detectLanguage('foo.md')).toBeNull()
      expect(detectLanguage('foo')).toBeNull()
    })
  })

  describe('isTestFile', () => {
    it('detects .test.ts files', () => {
      expect(isTestFile('src/foo.test.ts')).toBe(true)
    })

    it('detects .spec.ts files', () => {
      expect(isTestFile('src/foo.spec.ts')).toBe(true)
    })

    it('detects __tests__ directory', () => {
      expect(isTestFile('src/__tests__/foo.ts')).toBe(true)
    })

    it('detects Go _test.go files', () => {
      expect(isTestFile('src/foo_test.go')).toBe(true)
    })

    it('detects Python test_ files', () => {
      expect(isTestFile('tests/test_foo.py')).toBe(true)
    })

    it('detects Java Test files', () => {
      expect(isTestFile('src/test/java/FooTest.java')).toBe(true)
    })

    it('detects Ruby spec files', () => {
      expect(isTestFile('spec/foo_spec.rb')).toBe(true)
    })

    it('rejects source-only files', () => {
      expect(isTestFile('src/math.ts')).toBe(false)
    })

    it('rejects doc files', () => {
      expect(isTestFile('README.md')).toBe(false)
      expect(isTestFile('CHANGELOG.md')).toBe(false)
    })
  })

  describe('isSourceFile', () => {
    it('detects .ts files as source', () => {
      expect(isSourceFile('src/math.ts')).toBe(true)
    })

    it('detects .tsx files as source', () => {
      expect(isSourceFile('src/App.tsx')).toBe(true)
    })

    it('detects .js files as source', () => {
      expect(isSourceFile('src/math.js')).toBe(true)
    })

    it('returns true for test files too (matches by extension)', () => {
      // isSourceFile checks file extension only, does not exclude test files
      expect(isSourceFile('src/math.test.ts')).toBe(true)
    })

    it('rejects doc files', () => {
      expect(isSourceFile('README.md')).toBe(false)
    })
  })
})
