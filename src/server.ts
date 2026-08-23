import { createPrismaCatalogueServer } from './infrastructure/prisma/catalogue-server-composition.js';

const port = Number(process.env.PORT ?? 3000);

void createPrismaCatalogueServer()
  .then(({ server }) => {
    server.listen(port, () => {
      console.log(`Hope House ERP API listening on http://localhost:${port}`);
    });
  })
  .catch((error: unknown) => {
    console.error('Unable to start Hope House ERP API', error);
    process.exitCode = 1;
  });
