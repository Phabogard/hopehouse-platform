import { createHopeHouseServer } from './app.js';

const port = Number(process.env.PORT ?? 3000);

createHopeHouseServer().listen(port, () => {
  console.log(`Hope House ERP API listening on http://localhost:${port}`);
});
