import { type Api, webApi } from './platformApi';

export const getApi = (): Api => webApi();
