import { GraphQLClient, gql } from 'graphql-request';
import dotenv from 'dotenv';
dotenv.config();

const GRAPHQL_ENDPOINT = `${process.env.SHIMMIE_ENDPOINT}/graphql`;
const client = new GraphQLClient(GRAPHQL_ENDPOINT);

const introspectionQuery = gql`
  query {
    __schema {
        types {
            name
            fields {
                name
            }
        }
    }
  }
`;

async function main() {
  try {
    const data = await client.request(introspectionQuery);
    const userType = data.__schema.types.find(t => t.name === 'User');
    console.log('User type fields:');
    console.log(JSON.stringify(userType.fields, null, 2));
  } catch (err) {
    console.error('Introspection failed:', err);
  }
}

main();
