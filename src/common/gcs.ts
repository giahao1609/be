import { Storage } from '@google-cloud/storage';
import * as path from 'path';

const storage = new Storage({
  keyFilename: path.join(process.cwd(), 'gcs-key.json'), 
});

const bucketName = 'file-upload'; 
const bucket = storage.bucket(bucketName);

export default bucket;
