#!/usr/bin/env node
/**
 * @maideo/mcp — Official MCP server for the Maideo Agent API.
 *
 * Exposes 5 tools that map 1:1 on the public HTTP API:
 *   - search_coverage
 *   - get_quote
 *   - create_booking
 *   - enroll_avance_immediate
 *   - get_booking_status
 *
 * Runs over stdio. Install with `npm i -g @maideo/mcp` then add to your
 * Claude Desktop / Claude Code / ChatGPT MCP client config.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE =
  process.env.MAIDEO_API_BASE || "https://api.maideo.fr/public/agent";
const AGENT_NAME =
  process.env.MAIDEO_AGENT_NAME || "maideo-mcp-client";

async function apiRequest(path, { method = "GET", body, bookingToken } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "X-Agent-Name": AGENT_NAME,
  };
  if (bookingToken) {
    headers["Authorization"] = `Bearer ${bookingToken}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(
      `Maideo API ${res.status}: ${data.error || res.statusText}`
    );
    err.statusCode = res.status;
    err.details = data.details;
    throw err;
  }
  return data;
}

const server = new Server(
  {
    name: "@maideo/mcp",
    version: "0.1.2",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const TOOLS = [
  {
    name: "search_coverage",
    description:
      "Check whether Maideo serves a given French postal code and get the estimated hourly rate (gross, before the 50% tax credit advance). Use this BEFORE get_quote.",
    inputSchema: {
      type: "object",
      required: ["zip"],
      properties: {
        zip: {
          type: "string",
          pattern: "^[0-9]{5}$",
          description: "5-digit French postal code",
        },
        prestation: {
          type: "string",
          enum: ["MENAGE"],
          default: "MENAGE",
        },
      },
    },
  },
  {
    name: "get_quote",
    description:
      "Get a firm price quote for a cleaning booking. Returns a quoteToken valid for 72h that must be passed to create_booking.",
    inputSchema: {
      type: "object",
      required: ["zip", "nbHeuresSemaine", "frequency"],
      properties: {
        zip: { type: "string", pattern: "^[0-9]{5}$" },
        city: { type: "string" },
        nbHeuresSemaine: {
          type: "number",
          minimum: 2,
          description: "Number of hours per intervention",
        },
        nbPrestaSemaine: {
          type: "integer",
          default: 1,
          description: "Number of interventions per week",
        },
        frequency: {
          type: "string",
          enum: ["one_shot", "weekly", "bi_weekly", "monthly"],
        },
        prestation: {
          type: "string",
          enum: ["MENAGE"],
          default: "MENAGE",
        },
        prestationInfo: {
          type: "object",
          properties: {
            houseType: { type: "string" },
            houseSize: { type: "integer" },
            repassage: { type: "boolean" },
            pets: {
              type: "object",
              properties: {
                dog: { type: "boolean" },
                cat: { type: "boolean" },
              },
            },
            comments: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "create_booking",
    description:
      "Create a booking. Requires a quoteToken from get_quote plus the end-user's identity, address, and explicit consent. Returns a bookingToken (72h) for subsequent calls and a bookingId. The booking is held for 48h before worker dispatch as anti-fraud protection.",
    inputSchema: {
      type: "object",
      required: [
        "quoteToken",
        "client",
        "address",
        "dateDebut",
        "agentConsent",
      ],
      properties: {
        quoteToken: { type: "string" },
        client: {
          type: "object",
          required: ["firstName", "lastName", "email", "phone"],
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string", format: "email" },
            phone: { type: "string" },
          },
        },
        address: {
          type: "object",
          required: ["street", "city", "zip"],
          properties: {
            street: { type: "string" },
            city: { type: "string" },
            zip: { type: "string", pattern: "^[0-9]{5}$" },
            country: { type: "string", default: "France" },
          },
        },
        dateDebut: {
          type: "string",
          format: "date-time",
          description: "First intervention date (ISO 8601)",
        },
        frequency: {
          type: "string",
          enum: ["one_shot", "weekly", "bi_weekly", "monthly"],
        },
        nbHeuresSemaine: { type: "number" },
        nbPrestaSemaine: { type: "integer", default: 1 },
        comments: { type: "string" },
        agentConsent: {
          type: "boolean",
          description:
            "Attest that the end-user explicitly consented to share their data via your agent",
        },
      },
    },
  },
  {
    name: "enroll_avance_immediate",
    description:
      "Enroll the end user with URSSAF for the 50% immediate tax credit advance. After this succeeds, the user pays only half the gross hourly rate via SEPA. Required: bookingToken from create_booking, full identity, birth place, postal address, IBAN.",
    inputSchema: {
      type: "object",
      required: [
        "bookingId",
        "bookingToken",
        "civilite",
        "nomNaissance",
        "prenoms",
        "dateNaissance",
        "lieuNaissance",
        "numeroTelephonePortable",
        "adresseMail",
        "adressePostale",
        "coordonneeBancaire",
      ],
      properties: {
        bookingId: { type: "string" },
        bookingToken: { type: "string" },
        civilite: {
          type: "string",
          enum: ["1", "2"],
          description: "1=Monsieur, 2=Madame (NOT M/MME)",
        },
        nomNaissance: { type: "string" },
        nomUsage: { type: "string" },
        prenoms: { type: "string" },
        dateNaissance: { type: "string", format: "date" },
        lieuNaissance: {
          type: "object",
          properties: {
            codePaysNaissance: { type: "string" },
            departementNaissance: { type: "string" },
            communeNaissance: {
              type: "object",
              properties: {
                codeCommune: { type: "string" },
                libelleCommune: { type: "string" },
              },
            },
          },
        },
        numeroTelephonePortable: {
          type: "string",
          pattern: "^(0|\\+33)[6-7]([0-9]{2}){4}$",
        },
        adresseMail: { type: "string", format: "email" },
        adressePostale: {
          type: "object",
          properties: {
            libelleVoie: { type: "string" },
            libelleCommune: { type: "string" },
            codeCommune: { type: "string" },
            codePostal: { type: "string" },
            codePays: { type: "string" },
          },
        },
        coordonneeBancaire: {
          type: "object",
          required: ["bic", "iban", "titulaire"],
          properties: {
            bic: { type: "string" },
            iban: { type: "string" },
            titulaire: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "get_booking_status",
    description:
      "Poll the current status of a booking (order, mission, worker assignment, URSSAF enrollment). Requires bookingId + bookingToken from create_booking.",
    inputSchema: {
      type: "object",
      required: ["bookingId", "bookingToken"],
      properties: {
        bookingId: { type: "string" },
        bookingToken: { type: "string" },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case "search_coverage": {
        const qs = new URLSearchParams({
          zip: args.zip,
          prestation: args.prestation || "MENAGE",
        });
        result = await apiRequest(`/coverage?${qs.toString()}`);
        break;
      }
      case "get_quote": {
        result = await apiRequest("/quote", {
          method: "POST",
          body: args,
        });
        break;
      }
      case "create_booking": {
        result = await apiRequest("/book", {
          method: "POST",
          body: args,
        });
        break;
      }
      case "enroll_avance_immediate": {
        const { bookingId, bookingToken, ...urssafPayload } = args;
        result = await apiRequest(
          `/booking/${bookingId}/enroll-urssaf`,
          {
            method: "POST",
            body: urssafPayload,
            bookingToken,
          }
        );
        break;
      }
      case "get_booking_status": {
        const { bookingId, bookingToken } = args;
        result = await apiRequest(`/booking/${bookingId}`, {
          bookingToken,
        });
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error calling ${name}: ${err.message}${
            err.details ? `\nDetails: ${JSON.stringify(err.details)}` : ""
          }`,
        },
      ],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[@maideo/mcp] Server running on stdio");
