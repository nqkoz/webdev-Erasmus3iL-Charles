const readline = require('node:readline');
const fs = require('node:fs');
const path = require('node:path');


// Lecture des fichiers locaux au démarrage
const lectures = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'lectures.json'), 'utf8')
);

const student = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'student.json'), 'utf8')
);


// Fonction permettant de créer facilement le résultat d'un tool
function textResult(id, text, isError) {
  return {
    jsonrpc: '2.0',
    id: id,
    result: {
      content: [
        {
          type: 'text',
          text: text
        }
      ],
      isError: isError
    }
  };
}


// Liste des tools disponibles
const tools = [
  {
    name: 'find_lecture',
    description:
      'Return the title and topics of one course lecture by its number, 1 to 10. Use it when asked what a lecture covers.',
    inputSchema: {
      type: 'object',
      properties: {
        number: {
          type: 'integer',
          description: 'Lecture number, 1 to 10'
        }
      },
      required: ['number']
    }
  },

  {
    name: 'get_student_info',
    description:
      'Return local information about the student, including name, school and studies. Use it when asked about the student.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];


// Envoie une réponse JSON-RPC
function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}


// Traite les messages reçus
function handle(msg) {

  // 1. Initialisation MCP
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params.protocolVersion,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'lectures',
          version: '0.1.0'
        }
      }
    };
  }


  // 2. Notification d'initialisation
  if (msg.method === 'notifications/initialized') {
    return null;
  }


  // 3. Liste des tools
  if (msg.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: tools
      }
    };
  }


  // 4. Appel d'un tool
  if (msg.method === 'tools/call') {

    const name = msg.params.name;
    const args = msg.params.arguments || {};


    // Tool : find_lecture
    if (name === 'find_lecture') {

      const lecture = lectures.find(
        (l) => l.number === args.number
      );

      // La lecture n'existe pas
      if (!lecture) {
        return textResult(
          msg.id,
          'There is no lecture ' + args.number +
          '. The course has lectures 1 to 10.',
          true
        );
      }

      // Lecture trouvée
      return textResult(
        msg.id,
        'Lecture ' +
          lecture.number +
          ': ' +
          lecture.title +
          '. Topics: ' +
          lecture.topics,
        false
      );
    }


    // Tool personnel : get_student_info
    if (name === 'get_student_info') {

      const text =
        'Student: ' +
        student.name +
        '. School: ' +
        student.school +
        '. Studies: ' +
        student.studies +
        '.';

      return textResult(
        msg.id,
        text,
        false
      );
    }


    // Tool inconnu
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32602,
        message: 'Unknown tool: ' + name
      }
    };
  }


  // Méthode inconnue
  if (msg.id !== undefined) {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32601,
        message: 'Unknown method: ' + msg.method
      }
    };
  }


  return null;
}


// Lecture de stdin
const lines = readline.createInterface({
  input: process.stdin
});


lines.on('line', (line) => {

  // Logs uniquement sur stderr
  console.error('got: ' + line);

  const msg = JSON.parse(line);

  const reply = handle(msg);

  if (reply) {
    send(reply);
  }
});