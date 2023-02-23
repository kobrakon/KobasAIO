import fs from "fs";
import { ServerResponse } from "http";
import { inject, injectable } from "tsyringe";
import { HttpServerHelper } from "../helpers/HttpServerHelper";

@injectable()
export class HttpFileUtil
{
    constructor(
        @inject("HttpServerHelper") protected httpServerHelper: HttpServerHelper
    )
    {
    }

    public sendFile(resp: ServerResponse, file: any): void
    {
        const pathSlic = file.split("/");
        const type = this.httpServerHelper.getMimeText(pathSlic[pathSlic.length - 1].split(".").at(-1)) || this.httpServerHelper.getMimeText("txt");
        const fileStream = fs.createReadStream(file);

        fileStream.on("open", function ()
        {
            resp.setHeader("Content-Type", type);
            fileStream.pipe(resp);
        });
    }
}