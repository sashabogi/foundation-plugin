/**
 * Demerzel AI-Powered Analysis
 *
 * Uses the Recursive Language Model (RLM) engine for deep codebase analysis.
 * Leverages the Nucleus DSL to query documents that exceed context limits.
 *
 * Based on the Matryoshka RLM approach by Dmitri Sotnikov.
 * Ported from Foundation v2 to Foundation v3 plugin.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { createSnapshot } from './snapshot.mjs';

// ============================================================================
// Prompts
// ============================================================================

const NUCLEUS_COMMANDS = `
COMMANDS (output ONE per turn):
(grep "pattern")           - Find lines matching regex
(grep "pattern" "i")       - Case-insensitive search
(count RESULTS)            - Count matches
(take RESULTS n)           - First n results
(filter RESULTS (lambda (x) (match x.line "pattern" 0)))  - Filter results
(map RESULTS (lambda (x) x.line))  - Extract just the lines

VARIABLES: RESULTS = last result, _1 _2 _3 = results from turn 1,2,3

TO ANSWER: <<<FINAL>>>your answer<<<END>>>
`;

const CODEBASE_ANALYSIS_PROMPT = `You are analyzing a SOFTWARE CODEBASE snapshot to help a developer understand it.

The snapshot contains source files concatenated with "FILE: ./path/to/file" markers.

${NUCLEUS_COMMANDS}

## STRATEGY FOR CODEBASE SNAPSHOTS

**To find modules/directories:**
(grep "FILE:.*src/[^/]+/")       - top-level source dirs
(grep "FILE:.*mod\\\\.rs")         - Rust modules
(grep "FILE:.*index\\\\.(ts|js)")  - JS/TS modules

**To find implementations:**
(grep "fn function_name")        - Rust functions
(grep "function|const.*=>")      - JS functions
(grep "class ClassName")         - Classes
(grep "struct |type |interface") - Type definitions

**To understand structure:**
(grep "FILE:")                   - List all files
(grep "use |import |require")    - Find dependencies
(grep "pub |export")             - Public APIs

## RULES
1. Output ONLY a Nucleus command OR a final answer
2. NO explanations, NO markdown formatting in commands
3. MUST provide final answer by turn 8
4. If turn 6+, start summarizing what you found

## EXAMPLE SESSION
Turn 1: (grep "FILE:.*src/[^/]+/mod\\\\.rs")
Turn 2: (take RESULTS 15)
Turn 3: <<<FINAL>>>The codebase has these main modules:
- src/auth/ - Authentication handling
- src/api/ - API endpoints
- src/db/ - Database layer
...<<<END>>>
`;

const ARCHITECTURE_PROMPT = `You are generating an ARCHITECTURE SUMMARY of a codebase.

${NUCLEUS_COMMANDS}

## YOUR TASK
Create a summary suitable for CLAUDE.md that helps Claude Code understand this project after context compaction.

## SEARCH STRATEGY (do these in order)
1. (grep "FILE:.*mod\\\\.rs|FILE:.*index\\\\.(ts|js)") - Find module entry points
2. (take RESULTS 20) - Limit results
3. Based on file paths, provide your summary

## OUTPUT FORMAT
Your final answer should be structured like:

## Modules
- **module_name/** - Brief description based on files found

## Key Patterns
- Pattern observations from the code

## Important Files
- List key files and their apparent purpose

PROVIDE FINAL ANSWER BY TURN 6.
`;

const IMPLEMENTATION_PROMPT = `You are finding HOW something works in a codebase.

${NUCLEUS_COMMANDS}

## STRATEGY
1. (grep "FILE:.*keyword") - Find files related to the concept
2. (grep "keyword") - Find all mentions
3. (take RESULTS 30) - Limit if too many results
4. Look for function definitions, structs, classes
5. PROVIDE FINAL ANSWER based on file paths and code patterns found

## IMPORTANT
- You have 12 turns maximum
- By turn 8, START WRITING YOUR FINAL ANSWER
- Use what you've found - don't keep searching indefinitely
- It's better to give a partial answer than no answer

## OUTPUT FORMAT
Your final answer should explain:
- Which files contain the implementation
- Key functions/structs/classes involved
- Basic flow of how it works (based on what you found)
`;

const COUNT_PROMPT = `You are counting items in a codebase.

${NUCLEUS_COMMANDS}

## STRATEGY
1. (grep "pattern")
2. (count RESULTS)
3. <<<FINAL>>>There are N items matching the pattern.<<<END>>>

THIS SHOULD TAKE 2-3 TURNS MAXIMUM.
`;

const SEARCH_PROMPT = `You are searching for specific code.

${NUCLEUS_COMMANDS}

## STRATEGY
1. (grep "pattern")
2. (take RESULTS 20) if too many
3. Report what you found with file paths

PROVIDE FINAL ANSWER BY TURN 4.
`;

// ============================================================================
// Prompt Selection
// ============================================================================

function selectPrompt(query) {
  const q = query.toLowerCase();

  if (/how many|count|number of|total|how much/.test(q)) return COUNT_PROMPT;
  if (/^(find|search|show|list|where is|locate)\b/.test(q) && q.length < 50) return SEARCH_PROMPT;
  if (/architect|structure|overview|module|organization|main.*component|summar|layout/.test(q)) return ARCHITECTURE_PROMPT;
  if (/how does|how is|implement|work|handle|process|flow/.test(q)) return IMPLEMENTATION_PROMPT;

  return CODEBASE_ANALYSIS_PROMPT;
}

function getTurnLimit(query) {
  const q = query.toLowerCase();

  if (/how many|count/.test(q)) return 5;
  if (/^(find|search|show|list)\b/.test(q) && q.length < 50) return 6;
  if (/architect|overview|structure|module/.test(q)) return 12;
  if (/how does|how is|implement|work/.test(q)) return 12;

  return 12;
}

// ============================================================================
// Nucleus DSL Engine
// ============================================================================

function parseSExpression(input) {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return null;

  let pos = 0;

  function parse() {
    const token = tokens[pos++];

    if (token === '(') {
      const list = [];
      while (tokens[pos] !== ')' && pos < tokens.length) {
        list.push(parse());
      }
      pos++; // consume ')'
      return list;
    } else if (token.startsWith('"')) {
      return token.slice(1, -1).replace(/\\"/g, '"');
    } else if (/^-?\d+(\.\d+)?$/.test(token)) {
      return token;
    } else {
      return token;
    }
  }

  return parse();
}

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (/\s/.test(char)) { i++; continue; }

    if (char === '(' || char === ')') {
      tokens.push(char);
      i++;
      continue;
    }

    if (char === '"') {
      let str = '"';
      i++;
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          str += input[i] + input[i + 1];
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      str += '"';
      i++;
      tokens.push(str);
      continue;
    }

    let sym = '';
    while (i < input.length && !/[\s()]/.test(input[i])) {
      sym += input[i];
      i++;
    }
    tokens.push(sym);
  }

  return tokens;
}

function evaluateExpr(expr, content, bindings) {
  if (typeof expr === 'string') {
    if (bindings.has(expr)) return bindings.get(expr);
    if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
    return expr;
  }

  if (!Array.isArray(expr) || expr.length === 0) return expr;

  const [op, ...args] = expr;

  switch (op) {
    case 'grep': {
      const pattern = evaluateExpr(args[0], content, bindings);
      const flags = args[1] ? evaluateExpr(args[1], content, bindings) : '';
      let lines = bindings.get('__cached_lines__');
      if (!lines) {
        lines = content.split('\n');
        bindings.set('__cached_lines__', lines);
      }
      const matches = [];
      const MAX_MATCHES = 1000;

      let charIndex = 0;
      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const lineRegex = new RegExp(pattern, flags + 'g');
        let match;
        while ((match = lineRegex.exec(line)) !== null) {
          matches.push({
            match: match[0],
            line: line,
            lineNum: lineNum + 1,
            index: charIndex + match.index,
            groups: match.slice(1),
          });
          if (matches.length >= MAX_MATCHES) return matches;
        }
        charIndex += line.length + 1;
      }

      return matches;
    }

    case 'count': {
      const arr = evaluateExpr(args[0], content, bindings);
      return Array.isArray(arr) ? arr.length : 0;
    }

    case 'map': {
      const arr = evaluateExpr(args[0], content, bindings);
      const lambdaExpr = args[1];
      if (!Array.isArray(lambdaExpr) || lambdaExpr[0] !== 'lambda') {
        throw new Error('map requires a lambda expression');
      }
      const params = lambdaExpr[1];
      const body = lambdaExpr[2];
      const paramName = Array.isArray(params) ? params[0] : params;

      return arr.map(item => {
        const localBindings = new Map(bindings);
        localBindings.set(paramName, item);
        return evaluateExpr(body, content, localBindings);
      });
    }

    case 'filter': {
      const arr = evaluateExpr(args[0], content, bindings);
      const lambdaExpr = args[1];
      if (!Array.isArray(lambdaExpr) || lambdaExpr[0] !== 'lambda') {
        throw new Error('filter requires a lambda expression');
      }
      const params = lambdaExpr[1];
      const body = lambdaExpr[2];
      const paramName = Array.isArray(params) ? params[0] : params;

      return arr.filter(item => {
        const localBindings = new Map(bindings);
        localBindings.set(paramName, item);
        return evaluateExpr(body, content, localBindings);
      });
    }

    case 'first': {
      const arr = evaluateExpr(args[0], content, bindings);
      return arr[0];
    }

    case 'last': {
      const arr = evaluateExpr(args[0], content, bindings);
      return arr[arr.length - 1];
    }

    case 'take': {
      const arr = evaluateExpr(args[0], content, bindings);
      const n = evaluateExpr(args[1], content, bindings);
      return arr.slice(0, n);
    }

    case 'sort': {
      const arr = evaluateExpr(args[0], content, bindings);
      const key = evaluateExpr(args[1], content, bindings);
      return [...arr].sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        if (typeof aVal === 'number' && typeof bVal === 'number') return aVal - bVal;
        return String(aVal).localeCompare(String(bVal));
      });
    }

    case 'match': {
      const str = evaluateExpr(args[0], content, bindings);
      const strValue = typeof str === 'object' && str !== null && 'line' in str
        ? str.line
        : String(str);
      const pattern = evaluateExpr(args[1], content, bindings);
      const group = args[2] ? evaluateExpr(args[2], content, bindings) : 0;

      const regex = new RegExp(pattern);
      const match = strValue.match(regex);
      return match ? (match[group] || null) : null;
    }

    default:
      throw new Error(`Unknown command: ${op}`);
  }
}

function runNucleus(command, content, bindings) {
  const parsed = parseSExpression(command);
  if (!parsed) throw new Error(`Failed to parse command: ${command}`);
  return evaluateExpr(parsed, content, bindings);
}

function extractCommand(response) {
  const finalMatch = response.match(/<<<FINAL>>>([\s\S]*?)<<<END>>>/);
  if (finalMatch) return { finalAnswer: finalMatch[1].trim() };

  const sexpMatch = response.match(/\([^)]*(?:\([^)]*\)[^)]*)*\)/);
  if (sexpMatch) return { command: sexpMatch[0] };

  return {};
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Create a provider that calls the Daneel proxy or any OpenAI-compatible API.
 *
 * @param {object} [options]
 * @param {string} [options.baseUrl] - API base URL (default: process.env.LLM_BASE_URL || 'http://localhost:8889/v1')
 * @param {string} [options.model] - Model to use (default: 'qwen2.5-coder:7b')
 * @param {string} [options.apiKey] - API key (default: process.env.LLM_API_KEY || 'not-needed')
 * @returns {{ name: string, complete: function }}
 */
export function createDefaultProvider(options = {}) {
  const baseUrl = options.baseUrl || process.env.LLM_BASE_URL || 'http://localhost:8889/v1';
  const model = options.model || 'qwen2.5-coder:7b';
  const apiKey = options.apiKey || process.env.LLM_API_KEY || 'not-needed';

  return {
    name: 'default',
    async complete(messages, completionOptions = {}) {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: completionOptions.temperature ?? 0.7,
          max_tokens: completionOptions.maxTokens ?? 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Provider error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const finishReason = data.choices?.[0]?.finish_reason === 'stop' ? 'stop' : 'length';

      return {
        content,
        finishReason,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : undefined,
      };
    },
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * AI-powered deep analysis of a codebase.
 * Uses recursive reasoning with the Nucleus DSL to analyze content
 * exceeding typical context limits.
 *
 * @param {string} projectPath - Path to project directory or snapshot file
 * @param {string} question - Question about the codebase
 * @param {object} [options]
 * @param {number} [options.maxTurns=15] - Maximum reasoning turns
 * @param {boolean} [options.verbose=false] - Log progress to stderr
 * @param {{ name: string, complete: function }} [options.provider] - Custom AI provider (default: Daneel proxy)
 * @param {function} [options.onProgress] - Progress callback (turn, command, result)
 * @returns {Promise<{ answer: string, success: boolean, turns: number, commands: string[] }>}
 */
export async function analyzeArchitecture(projectPath, question, options = {}) {
  const {
    maxTurns = 15,
    verbose = false,
    onProgress,
  } = options;

  const provider = options.provider || createDefaultProvider();

  // Use dynamic turn limit based on query type, but cap at maxTurns
  const dynamicLimit = Math.min(getTurnLimit(question), maxTurns);

  // Determine snapshot path
  let snapshotPath;

  if (!existsSync(projectPath)) {
    throw new Error(`Path not found: ${projectPath}`);
  }

  const pathStat = statSync(projectPath);
  if (pathStat.isDirectory()) {
    // Create snapshot in project's .foundation dir
    createSnapshot(projectPath, { enhanced: true });
    snapshotPath = `${projectPath}/.foundation/snapshot.txt`;
  } else {
    snapshotPath = projectPath;
  }

  const content = readFileSync(snapshotPath, 'utf-8');

  // Get document stats for context
  const fileCount = (content.match(/^FILE:/gm) || []).length;
  const lineCount = (content.match(/\n/g) || []).length + 1;

  const bindings = new Map();
  const commands = [];
  const messages = [
    { role: 'system', content: selectPrompt(question) },
    {
      role: 'user',
      content: `CODEBASE SNAPSHOT:
- Total size: ${content.length.toLocaleString()} characters
- Files: ${fileCount}
- Lines: ${lineCount.toLocaleString()}

Files are marked with "FILE: ./path/to/file" headers.

QUERY: ${question}

Begin analysis. You have ${dynamicLimit} turns maximum - provide final answer before then.`,
    },
  ];

  for (let turn = 1; turn <= dynamicLimit; turn++) {
    const isLastTurn = turn === dynamicLimit;
    const isNearEnd = turn >= dynamicLimit - 2;

    if (verbose) {
      process.stderr.write(`\n[Turn ${turn}/${dynamicLimit}] Querying LLM...\n`);
    }

    const result = await provider.complete(messages);
    const response = result.content;

    if (verbose) {
      process.stderr.write(`[Turn ${turn}] Response: ${response.slice(0, 200)}...\n`);
    }

    const extracted = extractCommand(response);

    if (extracted.finalAnswer) {
      return {
        answer: extracted.finalAnswer,
        turns: turn,
        commands,
        success: true,
      };
    }

    if (!extracted.command) {
      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: 'Please provide a Nucleus command or final answer.' });
      continue;
    }

    const command = extracted.command;
    commands.push(command);

    if (verbose) {
      process.stderr.write(`[Turn ${turn}] Command: ${command}\n`);
    }

    try {
      const cmdResult = runNucleus(command, content, bindings);

      bindings.set('RESULTS', cmdResult);
      bindings.set(`_${turn}`, cmdResult);

      const resultStr = JSON.stringify(cmdResult, null, 2);
      const truncatedResult = resultStr.length > 2000
        ? resultStr.slice(0, 2000) + '...[truncated]'
        : resultStr;

      if (verbose) {
        process.stderr.write(`[Turn ${turn}] Result: ${truncatedResult.slice(0, 500)}...\n`);
      }

      onProgress?.(turn, command, cmdResult);

      messages.push({ role: 'assistant', content: command });

      let userMessage = `Result:\n${truncatedResult}`;
      if (isNearEnd && !isLastTurn) {
        userMessage += `\n\n[Warning] ${dynamicLimit - turn} turns remaining. Start forming your final answer.`;
      }
      messages.push({ role: 'user', content: userMessage });

      // Force final answer on last turn
      if (isLastTurn) {
        messages.push({
          role: 'user',
          content: 'STOP SEARCHING. Based on everything you found, provide your final answer NOW using <<<FINAL>>>your answer<<<END>>>',
        });

        const finalResult = await provider.complete(messages);
        const finalExtracted = extractCommand(finalResult.content);

        if (finalExtracted.finalAnswer) {
          return {
            answer: finalExtracted.finalAnswer,
            turns: turn,
            commands,
            success: true,
          };
        }

        return {
          answer: finalResult.content,
          turns: turn,
          commands,
          success: true,
        };
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      if (verbose) {
        process.stderr.write(`[Turn ${turn}] Error: ${errMsg}\n`);
      }
      messages.push({ role: 'assistant', content: command });
      messages.push({ role: 'user', content: `Error running command: ${errMsg}` });
    }
  }

  return {
    answer: 'Maximum turns reached without final answer',
    turns: dynamicLimit,
    commands,
    success: false,
    error: 'Max turns reached',
  };
}
