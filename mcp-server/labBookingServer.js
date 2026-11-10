const readline = require('node:readline');
const { openDatabase } = require('../src/data/database');
const authService = require('../src/services/authService');
const bookingService = require('../src/services/bookingService');
const slotSuggestionService = require('../src/services/slotSuggestionService');

const tools = [
  {
    name: 'list_free_slots',
    description: 'List free one-hour workstation slots for a weekday within the next 30 days. Students and lab staff may view availability.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Booking date in YYYY-MM-DD format.' },
      },
      required: ['date'],
      additionalProperties: false,
    },
  },
  {
    name: 'my_bookings',
    description: 'List only the signed-in student’s bookings, including lab, workstation, time and status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'book_slot',
    description: 'Book one currently free workstation slot for the signed-in student. Conflicts and booking limits are enforced.',
    inputSchema: {
      type: 'object',
      properties: {
        workstationId: { type: 'integer', minimum: 1 },
        startsAt: { type: 'string', description: 'Slot start as an ISO-8601 UTC timestamp.' },
      },
      required: ['workstationId', 'startsAt'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_booking',
    description: 'Cancel the signed-in student’s own future booking. Another student’s booking cannot be cancelled.',
    inputSchema: {
      type: 'object',
      properties: {
        bookingId: { type: 'integer', minimum: 1 },
      },
      required: ['bookingId'],
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_slot',
    description: 'Suggest one available slot for web_cloud or networking. The suggestion never creates a booking.',
    inputSchema: {
      type: 'object',
      properties: {
        activityType: { type: 'string', enum: ['web_cloud', 'networking'] },
        date: { type: 'string', description: 'Booking date in YYYY-MM-DD format.' },
      },
      required: ['activityType', 'date'],
      additionalProperties: false,
    },
  },
];

function textResult(id, value, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text }],
      isError,
    },
  };
}

function protocolError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function createLabBookingMcpServer(database, token, {
  nowProvider = () => new Date(),
  slotSuggestionClient,
} = {}) {
  async function handle(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)
      || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return protocolError(message?.id ?? null, -32600, 'Invalid JSON-RPC request.');
    }

    if (message.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: message.params?.protocolVersion || '2025-11-25',
          capabilities: { tools: {} },
          serverInfo: { name: 'lab-booking', version: '1.0.0' },
        },
      };
    }
    if (message.method === 'notifications/initialized') return null;
    if (message.method === 'tools/list') {
      return { jsonrpc: '2.0', id: message.id, result: { tools } };
    }
    if (message.method !== 'tools/call') {
      return message.id === undefined
        ? null
        : protocolError(message.id, -32601, `Unknown method: ${message.method}`);
    }

    const params = message.params;
    if (!params || typeof params.name !== 'string'
      || (params.arguments !== undefined
        && (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)))) {
      return protocolError(message.id, -32602, 'Invalid tool call parameters.');
    }
    const tool = tools.find(({ name }) => name === params.name);
    if (!tool) return protocolError(message.id, -32602, `Unknown tool: ${params.name}`);

    try {
      const user = authService.getUserForSession(database, token);
      if (!user) return textResult(message.id, 'Sign in again; the configured MCP session is missing or expired.', true);
      const args = params.arguments || {};
      let result;
      switch (params.name) {
        case 'list_free_slots':
          result = bookingService.listAvailableSlots(database, user.id, args.date, nowProvider());
          break;
        case 'my_bookings':
          result = bookingService.listMyBookings(database, user.id);
          break;
        case 'book_slot':
          result = bookingService.createBooking(database, user.id, {
            workstationId: args.workstationId,
            startsAt: args.startsAt,
          }, nowProvider());
          break;
        case 'cancel_booking':
          result = bookingService.cancelBooking(database, user.id, args.bookingId, nowProvider());
          break;
        case 'suggest_slot':
          result = await slotSuggestionService.suggestSlot(database, user.id, {
            activityType: args.activityType,
            date: args.date,
          }, nowProvider(), slotSuggestionClient);
          break;
        default:
          return protocolError(message.id, -32602, `Unknown tool: ${params.name}`);
      }
      return textResult(message.id, result);
    } catch (error) {
      if (error instanceof bookingService.BookingError) {
        return textResult(message.id, error.message, true);
      }
      console.error(`Lab Booking MCP tool failed: ${params.name} (${error.name || 'Error'})`);
      return textResult(message.id, 'The tool could not complete. Check the server diagnostics.', true);
    }
  }

  return { handle };
}

async function runServer() {
  const token = process.env.MCP_TOKEN;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    console.error('MCP_TOKEN must be the current 64-character lab_session token.');
    return 1;
  }

  let database;
  try {
    database = openDatabase();
  } catch (error) {
    console.error(`Could not open the Lab Booking database: ${error.message}`);
    return 1;
  }

  const server = createLabBookingMcpServer(database, token);
  const input = readline.createInterface({ input: process.stdin });
  let queue = Promise.resolve();
  input.on('line', (line) => {
    queue = queue.then(async () => {
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        process.stdout.write(`${JSON.stringify(protocolError(null, -32700, 'Parse error.'))}\n`);
        return;
      }
      const reply = await server.handle(message);
      if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`);
    }).catch(() => {
      console.error('Lab Booking MCP request failed unexpectedly.');
    });
  });
  input.on('close', () => {
    queue.finally(() => database.close());
  });
  return 0;
}

if (require.main === module) {
  runServer().then((exitCode) => {
    if (exitCode !== 0) process.exitCode = exitCode;
  }).catch((error) => {
    console.error('Could not start the Lab Booking MCP server.');
    process.exitCode = 1;
  });
}

module.exports = { createLabBookingMcpServer, runServer, tools };
