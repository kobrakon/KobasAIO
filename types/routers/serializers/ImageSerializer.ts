import { IncomingMessage, ServerResponse } from "http";
import { inject, injectable } from "tsyringe";

import { Serializer } from "../../di/Serializer";
import { ImageRouter } from "../ImageRouter";

@injectable()
export class ImageSerializer extends Serializer 
{
    constructor(
        @inject("ImageRouter") protected imageRouter: ImageRouter
    )
    {
        super();
    }

    public override serialize(sessionID: string, req: IncomingMessage, resp: ServerResponse, body: any): void 
    {
        this.imageRouter.sendImage(sessionID, req, resp, body);
    }

    public override canHandle(route: string): boolean
    {
        return route === "IMAGE";
    }
}