declare module 'jsmediatags' {
  interface Tags {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    genre?: string;
    track?: string;
    picture?: {
      format: string;
      type: string;
      description: string;
      data: number[];
    };
  }
  interface TagResult {
    type: string;
    tags: Tags;
  }
  interface Callbacks {
    onSuccess: (result: TagResult) => void;
    onError: (error: { type: string; info: string }) => void;
  }
  const jsmediatags: {
    read: (file: Blob | string, callbacks: Callbacks) => void;
  };
  export default jsmediatags;
}

declare module 'browser-id3-writer' {
  class ID3Writer {
    constructor(buffer: ArrayBuffer);
    setFrame(name: string, value: any): ID3Writer;
    addTag(): void;
    arrayBuffer: ArrayBuffer;
  }
  export default ID3Writer;
}
