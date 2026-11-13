import { createConnector, ProviderNotFoundError } from 'wagmi';
import {
  type Address,
  type EIP1193Provider,
  getAddress,
  numberToHex,
  SwitchChainError,
  UserRejectedRequestError,
   withRetry,
} from 'viem';

export type BrowserWalletId = 'core' | 'metaMask' | 'rainbow' | 'base';
export type WalletOptionId = BrowserWalletId | 'walletConnect';

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

export interface WalletOptionMeta {
  id: WalletOptionId;
  name: string;
  iconUrl: string;
  downloadUrl: string;
  rdnsList: string[];
}

// Official SVG logos (data URLs) for the 5 supported wallets
export const CORE_ICON_URL =
  "data:image/svg+xml,%3C%3Fxml%20version%3D%221.0%22%20encoding%3D%22UTF-8%22%3F%3E%0A%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20xmlns%3Axlink%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2Fxlink%22%20width%3D%2228px%22%20height%3D%2228px%22%20viewBox%3D%220%200%2028%2028%22%20version%3D%221.1%22%3E%0A%3Cg%20id%3D%22surface1%22%3E%0A%3Crect%20x%20%3D%220%22%20y%3D%220%22%20width%3D%2228%22%20height%3D%2228%22%20style%3D%22fill%3Argb(15.686275%25%2C15.686275%25%2C18.039216%25)%3Bfill-opacity%3A1%3Bstroke%3Anone%3B%22%2F%3E%0A%3Cpath%20style%3D%22%20stroke%3Anone%3Bfill-rule%3Anonzero%3Bfill%3Argb(94.901961%25%2C94.901961%25%2C95.294118%25)%3Bfill-opacity%3A1%3B%22%20d%3D%22M%2011.503906%2010.828125%20C%2012.105469%2010.828125%2012.652344%2010.957031%2013.140625%2011.21875%20C%2013.628906%2011.476562%2014.015625%2011.847656%2014.296875%2012.324219%20C%2014.578125%2012.800781%2014.722656%2013.351562%2014.722656%2013.972656%20C%2014.722656%2014.597656%2014.574219%2015.144531%2014.285156%2015.621094%20C%2013.996094%2016.097656%2013.605469%2016.46875%2013.113281%2016.726562%20C%2012.617188%2016.988281%2012.066406%2017.117188%2011.457031%2017.117188%20C%2010.847656%2017.117188%2010.3125%2016.988281%209.832031%2016.726562%20C%209.351562%2016.46875%208.972656%2016.101562%208.699219%2015.621094%20C%208.667969%2015.570312%208.636719%2015.515625%208.609375%2015.457031%20C%208.582031%2015.515625%208.550781%2015.570312%208.515625%2015.621094%20C%208.226562%2016.097656%207.835938%2016.46875%207.34375%2016.726562%20C%206.851562%2016.988281%206.296875%2017.117188%205.6875%2017.117188%20C%205.078125%2017.117188%204.542969%2016.988281%204.0625%2016.726562%20C%203.582031%2016.46875%203.203125%2016.101562%202.929688%2015.621094%20C%202.652344%2015.144531%202.515625%2014.597656%202.515625%2013.972656%20C%202.515625%2013.351562%202.65625%2012.800781%202.9375%2012.324219%20C%203.222656%2011.847656%203.605469%2011.480469%204.097656%2011.21875%20C%204.585938%2010.957031%205.132812%2010.828125%205.734375%2010.828125%20C%206.335938%2010.828125%206.882812%2010.957031%207.371094%2011.21875%20C%207.859375%2011.476562%208.246094%2011.847656%208.527344%2012.324219%20C%208.558594%2012.378906%208.589844%2012.433594%208.617188%2012.488281%20C%208.644531%2012.433594%208.675781%2012.378906%208.707031%2012.324219%20C%208.992188%2011.847656%209.375%2011.480469%209.867188%2011.21875%20C%2010.355469%2010.957031%2010.902344%2010.828125%2011.503906%2010.828125%20Z%20M%2011.503906%2012.324219%20C%2011.1875%2012.324219%2010.898438%2012.390625%2010.640625%2012.527344%20C%2010.382812%2012.664062%2010.179688%2012.859375%2010.03125%2013.109375%20C%209.882812%2013.359375%209.808594%2013.644531%209.808594%2013.972656%20C%209.808594%2014.300781%209.882812%2014.589844%2010.027344%2014.839844%20C%2010.171875%2015.085938%2010.371094%2015.28125%2010.625%2015.417969%20C%2010.875%2015.554688%2011.164062%2015.621094%2011.480469%2015.621094%20C%2011.796875%2015.621094%2012.089844%2015.554688%2012.351562%2015.417969%20C%2012.609375%2015.28125%2012.816406%2015.085938%2012.96875%2014.839844%20C%2013.121094%2014.589844%2013.195312%2014.300781%2013.195312%2013.972656%20C%2013.195312%2013.644531%2013.121094%2013.359375%2012.972656%2013.109375%20C%2012.824219%2012.859375%2012.621094%2012.664062%2012.363281%2012.527344%20C%2012.105469%2012.390625%2011.820312%2012.324219%2011.503906%2012.324219%20Z%20M%205.761719%2012.324219%20C%205.445312%2012.324219%205.15625%2012.390625%204.898438%2012.527344%20C%204.640625%2012.664062%204.441406%2012.859375%204.289062%2013.109375%20C%204.140625%2013.359375%204.066406%2013.644531%204.066406%2013.972656%20C%204.066406%2014.300781%204.140625%2014.589844%204.285156%2014.839844%20C%204.429688%2015.085938%204.628906%2015.28125%204.882812%2015.417969%20C%205.136719%2015.554688%205.421875%2015.621094%205.738281%2015.621094%20C%206.054688%2015.621094%206.347656%2015.554688%206.609375%2015.417969%20C%206.867188%2015.28125%207.074219%2015.085938%207.226562%2014.839844%20L%208.382812%2014.839844%20C%208.316406%2014.566406%208.285156%2014.277344%208.285156%2013.972656%20C%208.285156%2013.703125%208.3125%2013.445312%208.363281%2013.203125%20L%207.226562%2013.203125%20C%207.117188%2012.886719%206.878906%2012.664062%206.625%2012.527344%20C%206.367188%2012.390625%206.078125%2012.324219%205.761719%2012.324219%20Z%20M%2022.402344%2010.828125%20C%2022.996094%2010.828125%2023.527344%2010.953125%2024%2011.203125%20C%2024.46875%2011.449219%2024.835938%2011.804688%2025.09375%2012.261719%20C%2025.355469%2012.722656%2025.484375%2013.246094%2025.484375%2013.839844%20C%2025.484375%2014.0625%2025.46875%2014.257812%2025.4375%2014.433594%20L%2020.867188%2014.433594%20L%2020.871094%2014.5%20C%2020.921875%2014.910156%2021.074219%2015.230469%2021.339844%2015.46875%20C%2021.617188%2015.71875%2021.960938%2015.84375%2022.367188%2015.84375%20C%2022.957031%2015.84375%2023.371094%2015.597656%2023.621094%2015.105469%20L%2025.328125%2015.105469%20L%2025.300781%2015.179688%20C%2025.117188%2015.734375%2024.777344%2016.191406%2024.289062%2016.550781%20C%2023.777344%2016.929688%2023.148438%2017.117188%2022.402344%2017.117188%20C%2021.800781%2017.117188%2021.261719%2016.988281%2020.78125%2016.726562%20C%2020.304688%2016.46875%2019.929688%2016.097656%2019.664062%2015.621094%20C%2019.398438%2015.144531%2019.261719%2014.597656%2019.261719%2013.972656%20C%2019.261719%2013.433594%2019.359375%2012.953125%2019.550781%2012.527344%20L%2018.984375%2012.527344%20C%2018.667969%2012.535156%2018.40625%2012.605469%2018.199219%2012.734375%20C%2017.980469%2012.871094%2017.820312%2013.0625%2017.722656%2013.300781%20C%2017.621094%2013.539062%2017.574219%2013.8125%2017.574219%2014.121094%20L%2017.574219%2015.683594%20L%2019.285156%2015.683594%20L%2019.285156%2017.09375%20L%2014.597656%2017.09375%20L%2014.597656%2015.683594%20L%2015.863281%2015.683594%20L%2015.863281%2012.429688%20L%2014.597656%2012.429688%20L%2014.597656%2011.023438%20L%2017.445312%2011.023438%20L%2017.5%2012.074219%20L%2017.542969%2012%20C%2017.644531%2011.828125%2017.765625%2011.671875%2017.90625%2011.535156%20C%2018.066406%2011.375%2018.261719%2011.25%2018.5%2011.160156%20C%2018.734375%2011.066406%2019.019531%2011.023438%2019.355469%2011.023438%20L%2020.078125%2011.023438%20L%2020.078125%2011.738281%20C%2020.273438%2011.53125%2020.503906%2011.355469%2020.765625%2011.214844%20C%2021.238281%2010.957031%2021.785156%2010.828125%2022.402344%2010.828125%20Z%20M%2022.355469%2012.09375%20C%2021.964844%2012.09375%2021.636719%2012.207031%2021.367188%2012.4375%20C%2021.101562%2012.671875%2020.9375%2012.992188%2020.878906%2013.402344%20L%2023.847656%2013.402344%20C%2023.839844%2013.003906%2023.691406%2012.6875%2023.40625%2012.449219%20C%2023.121094%2012.210938%2022.769531%2012.09375%2022.355469%2012.09375%20Z%20M%2022.355469%2012.09375%20%22%2F%3E%0A%3C%2Fg%3E%0A%3C%2Fsvg%3E%0A";

export const METAMASK_ICON_URL =
  "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22none%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h28v28H0z%22%2F%3E%3Cg%20clip-path%3D%22url(%23a)%22%3E%3Cpath%20fill%3D%22%23ff5c16%22%20d%3D%22m24.024%2023.824-4.846-1.434-3.655%202.172-2.55-.001-3.656-2.171-4.844%201.434L3%2018.88l1.473-5.488L3%208.751%204.473%203l7.569%204.496h4.413L24.024%203l1.473%205.751-1.473%204.64%201.473%205.488z%22%2F%3E%3Cpath%20fill%3D%22%23ff5c16%22%20d%3D%22m4.474%203%207.57%204.499-.302%203.087zm4.844%2015.881%203.33%202.522-3.33.987zm3.064-4.17-.64-4.123-4.097%202.804h-.002v.001l.013%202.886%201.661-1.567zM24.024%203l-7.57%204.499.3%203.087zM19.18%2018.881l-3.33%202.522%203.33.987zm1.674-5.488v-.002zl-4.097-2.804-.64%204.124h3.064l1.662%201.567z%22%2F%3E%3Cpath%20fill%3D%22%23e34807%22%20d%3D%22m9.317%2022.39-4.844%201.434L3%2018.881h6.317zm3.064-7.68.925%205.962-1.282-3.315-4.37-1.078%201.662-1.568zm6.799%207.68%204.844%201.434%201.473-4.943H19.18zm-3.064-7.68-.925%205.962%201.282-3.315%204.37-1.078-1.663-1.568z%22%2F%3E%3Cpath%20fill%3D%22%23ff8d5d%22%20d%3D%22m3%2018.88%201.473-5.489h3.169l.012%202.887%204.37%201.078%201.282%203.314-.659.73-3.33-2.522H3zm22.497%200-1.473-5.489h-3.17l-.01%202.887-4.371%201.078-1.282%203.314.659.73%203.33-2.522h6.317zM16.455%207.495h-4.413l-.3%203.087%201.565%2010.084h1.884l1.565-10.084z%22%2F%3E%3Cpath%20fill%3D%22%23661800%22%20d%3D%22M4.473%203%203%208.751l1.473%204.64h3.169l4.1-2.805zm6.992%2012.908H10.03l-.781.761%202.776.685-.56-1.447M24.024%203l1.473%205.751-1.473%204.64h-3.17l-4.098-2.805zm-6.99%2012.908h1.437l.782.762-2.78.686.56-1.45zm-1.512%206.687.328-1.193-.66-.73h-1.885l-.659.73.327%201.192%22%2F%3E%3Cpath%20fill%3D%22%23c0c4cd%22%20d%3D%22M15.522%2022.594v1.969h-2.548v-1.969z%22%2F%3E%3Cpath%20fill%3D%22%23e7ebf6%22%20d%3D%22m9.318%2022.388%203.658%202.174v-1.969l-.328-1.192zm9.862%200-3.658%202.174v-1.969l.328-1.192z%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3CclipPath%20id%3D%22a%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M3%203h22.5v21.563H3z%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E";

export const RAINBOW_ICON_URL =
  "data:image/svg+xml,%3Csvg%20width%3D%22120%22%20height%3D%22120%22%20viewBox%3D%220%200%20120%20120%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Crect%20width%3D%22120%22%20height%3D%22120%22%20fill%3D%22url(%23paint0_linear_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M20%2038H26C56.9279%2038%2082%2063.0721%2082%2094V100H94C97.3137%20100%20100%2097.3137%20100%2094C100%2053.1309%2066.8691%2020%2026%2020C22.6863%2020%2020%2022.6863%2020%2026V38Z%22%20fill%3D%22url(%23paint1_radial_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M84%2094H100C100%2097.3137%2097.3137%20100%2094%20100H84V94Z%22%20fill%3D%22url(%23paint2_linear_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M26%2020L26%2036H20L20%2026C20%2022.6863%2022.6863%2020%2026%2020Z%22%20fill%3D%22url(%23paint3_linear_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M20%2036H26C58.0325%2036%2084%2061.9675%2084%2094V100H66V94C66%2071.9086%2048.0914%2054%2026%2054H20V36Z%22%20fill%3D%22url(%23paint4_radial_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M68%2094H84V100H68V94Z%22%20fill%3D%22url(%23paint5_linear_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M20%2052L20%2036L26%2036L26%2052H20Z%22%20fill%3D%22url(%23paint6_linear_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M20%2062C20%2065.3137%2022.6863%2068%2026%2068C40.3594%2068%2052%2079.6406%2052%2094C52%2097.3137%2054.6863%20100%2058%20100H68V94C68%2070.804%2049.196%2052%2026%2052H20V62Z%22%20fill%3D%22url(%23paint7_radial_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M52%2094H68V100H58C54.6863%20100%2052%2097.3137%2052%2094Z%22%20fill%3D%22url(%23paint8_radial_62_329)%22%2F%3E%0A%3Cpath%20d%3D%22M26%2068C22.6863%2068%2020%2065.3137%2020%2062L20%2052L26%2052L26%2068Z%22%20fill%3D%22url(%23paint9_radial_62_329)%22%2F%3E%0A%3Cdefs%3E%0A%3ClinearGradient%20id%3D%22paint0_linear_62_329%22%20x1%3D%2260%22%20y1%3D%220%22%20x2%3D%2260%22%20y2%3D%22120%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%0A%3Cstop%20stop-color%3D%22%23174299%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23001E59%22%2F%3E%0A%3C%2FlinearGradient%3E%0A%3CradialGradient%20id%3D%22paint1_radial_62_329%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(26%2094)%20rotate(-90)%20scale(74)%22%3E%0A%3Cstop%20offset%3D%220.770277%22%20stop-color%3D%22%23FF4000%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238754C9%22%2F%3E%0A%3C%2FradialGradient%3E%0A%3ClinearGradient%20id%3D%22paint2_linear_62_329%22%20x1%3D%2283%22%20y1%3D%2297%22%20x2%3D%22100%22%20y2%3D%2297%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%0A%3Cstop%20stop-color%3D%22%23FF4000%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%238754C9%22%2F%3E%0A%3C%2FlinearGradient%3E%0A%3ClinearGradient%20id%3D%22paint3_linear_62_329%22%20x1%3D%2223%22%20y1%3D%2220%22%20x2%3D%2223%22%20y2%3D%2237%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%0A%3Cstop%20stop-color%3D%22%238754C9%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23FF4000%22%2F%3E%0A%3C%2FlinearGradient%3E%0A%3CradialGradient%20id%3D%22paint4_radial_62_329%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(26%2094)%20rotate(-90)%20scale(58)%22%3E%0A%3Cstop%20offset%3D%220.723929%22%20stop-color%3D%22%23FFF700%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23FF9901%22%2F%3E%0A%3C%2FradialGradient%3E%0A%3ClinearGradient%20id%3D%22paint5_linear_62_329%22%20x1%3D%2268%22%20y1%3D%2297%22%20x2%3D%2284%22%20y2%3D%2297%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%0A%3Cstop%20stop-color%3D%22%23FFF700%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23FF9901%22%2F%3E%0A%3C%2FlinearGradient%3E%0A%3ClinearGradient%20id%3D%22paint6_linear_62_329%22%20x1%3D%2223%22%20y1%3D%2252%22%20x2%3D%2223%22%20y2%3D%2236%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%0A%3Cstop%20stop-color%3D%22%23FFF700%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23FF9901%22%2F%3E%0A%3C%2FlinearGradient%3E%0A%3CradialGradient%20id%3D%22paint7_radial_62_329%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(26%2094)%20rotate(-90)%20scale(42)%22%3E%0A%3Cstop%20offset%3D%220.59513%22%20stop-color%3D%22%2300AAFF%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2301DA40%22%2F%3E%0A%3C%2FradialGradient%3E%0A%3CradialGradient%20id%3D%22paint8_radial_62_329%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(51%2097)%20scale(17%2045.3333)%22%3E%0A%3Cstop%20stop-color%3D%22%2300AAFF%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2301DA40%22%2F%3E%0A%3C%2FradialGradient%3E%0A%3CradialGradient%20id%3D%22paint9_radial_62_329%22%20cx%3D%220%22%20cy%3D%220%22%20r%3D%221%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(23%2069)%20rotate(-90)%20scale(17%20322.37)%22%3E%0A%3Cstop%20stop-color%3D%22%2300AAFF%22%2F%3E%0A%3Cstop%20offset%3D%221%22%20stop-color%3D%22%2301DA40%22%2F%3E%0A%3C%2FradialGradient%3E%0A%3C%2Fdefs%3E%0A%3C%2Fsvg%3E%0A";

export const BASE_ICON_URL =
  "data:image/svg+xml,%3Csvg%20width%3D%2296%22%20height%3D%2296%22%20viewBox%3D%220%200%2096%2096%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Cpath%20d%3D%22M0%207.584C0%204.98628%200%203.68742%200.489468%202.68829C0.958114%201.73167%201.73167%200.958114%202.68829%200.489468C3.68742%200%204.98628%200%207.584%200H88.416C91.0137%200%2092.3126%200%2093.3117%200.489468C94.2683%200.958114%2095.0419%201.73167%2095.5105%202.68829C96%203.68742%2096%204.98628%2096%207.584V88.416C96%2091.0137%2096%2092.3126%2095.5105%2093.3117C95.0419%2094.2683%2094.2683%2095.0419%2093.3117%2095.5105C92.3126%2096%2091.0137%2096%2088.416%2096H7.584C4.98628%2096%203.68742%2096%202.68829%2095.5105C1.73167%2095.0419%200.958114%2094.2683%200.489468%2093.3117C0%2092.3126%200%2091.0137%200%2088.416V7.584Z%22%20fill%3D%22%230000FF%22%2F%3E%0A%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2228%22%20fill%3D%22white%22%2F%3E%0A%3Cpath%20d%3D%22M20%2045H48V51H20V45Z%22%20fill%3D%22%230000FF%22%2F%3E%0A%3C%2Fsvg%3E%0A";

export const WALLETCONNECT_ICON_URL =
  "data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22%233B99FC%22%2F%3E%0A%3Cpath%20d%3D%22M8.38969%2010.3739C11.4882%207.27538%2016.5118%207.27538%2019.6103%2010.3739L19.9832%2010.7468C20.1382%2010.9017%2020.1382%2011.1529%2019.9832%2011.3078L18.7076%2012.5835C18.6301%2012.6609%2018.5045%2012.6609%2018.4271%2012.5835L17.9139%2012.0703C15.7523%209.9087%2012.2477%209.9087%2010.0861%2012.0703L9.53655%2012.6198C9.45909%2012.6973%209.3335%2012.6973%209.25604%2012.6198L7.98039%2011.3442C7.82547%2011.1893%207.82547%2010.9381%207.98039%2010.7832L8.38969%2010.3739ZM22.2485%2013.012L23.3838%2014.1474C23.5387%2014.3023%2023.5387%2014.5535%2023.3838%2014.7084L18.2645%2019.8277C18.1096%2019.9827%2017.8584%2019.9827%2017.7035%2019.8277C17.7035%2019.8277%2017.7035%2019.8277%2017.7035%2019.8277L14.0702%2016.1944C14.0314%2016.1557%2013.9686%2016.1557%2013.9299%2016.1944C13.9299%2016.1944%2013.9299%2016.1944%2013.9299%2016.1944L10.2966%2019.8277C10.1417%2019.9827%209.89053%2019.9827%209.73561%2019.8278C9.7356%2019.8278%209.7356%2019.8277%209.7356%2019.8277L4.61619%2014.7083C4.46127%2014.5534%204.46127%2014.3022%204.61619%2014.1473L5.75152%2013.012C5.90645%2012.857%206.15763%2012.857%206.31255%2013.012L9.94595%2016.6454C9.98468%2016.6841%2010.0475%2016.6841%2010.0862%2016.6454C10.0862%2016.6454%2010.0862%2016.6454%2010.0862%2016.6454L13.7194%2013.012C13.8743%2012.857%2014.1255%2012.857%2014.2805%2013.012C14.2805%2013.012%2014.2805%2013.012%2014.2805%2013.012L17.9139%2016.6454C17.9526%2016.6841%2018.0154%2016.6841%2018.0541%2016.6454L21.6874%2013.012C21.8424%2012.8571%2022.0936%2012.8571%2022.2485%2013.012Z%22%20fill%3D%22white%22%2F%3E%0A%3C%2Fsvg%3E%0A";

export const WALLET_OPTIONS: WalletOptionMeta[] = [
  {
    id: 'core',
    name: 'Core',
    iconUrl: CORE_ICON_URL,
    downloadUrl: 'https://core.app/',
    rdnsList: ['app.core.extension', 'com.avax.core'],
  },
  {
    id: 'metaMask',
    name: 'MetaMask',
    iconUrl: METAMASK_ICON_URL,
    downloadUrl: 'https://metamask.io/download/',
    rdnsList: ['io.metamask', 'io.metamask.flask', 'io.metamask.mobile'],
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    iconUrl: RAINBOW_ICON_URL,
    downloadUrl: 'https://rainbow.me/download',
    rdnsList: ['me.rainbow'],
  },
  {
    id: 'base',
    name: 'Base',
    iconUrl: BASE_ICON_URL,
    downloadUrl: 'https://www.coinbase.com/wallet/downloads',
    rdnsList: ['com.coinbase.wallet'],
  },
  {
    id: 'walletConnect',
    name: 'WalletConnect',
    iconUrl: WALLETCONNECT_ICON_URL,
    downloadUrl: 'https://walletconnect.network/',
    rdnsList: [],
  },
];

// EIP-6963 announced provider store
const announcedProviders = new Map<string, EIP6963ProviderDetail>();
let eip6963Initialized = false;

export function registerAnnouncedProvider(detail: EIP6963ProviderDetail) {
  if (!detail?.info || !detail?.provider) return;
  const key = detail.info.rdns || detail.info.uuid || detail.info.name;
  if (key) {
    announcedProviders.set(key, detail);
  }
}

export function clearAnnouncedProviders() {
  announcedProviders.clear();
}

export function getAnnouncedProviders(): EIP6963ProviderDetail[] {
  return Array.from(announcedProviders.values());
}

export function initEip6963Discovery(win?: any) {
  const targetWin = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!targetWin || typeof targetWin.addEventListener !== 'function') return;

  if (!eip6963Initialized) {
    eip6963Initialized = true;
    targetWin.addEventListener('eip6963:announceProvider', (event: any) => {
      if (event?.detail) {
        registerAnnouncedProvider(event.detail);
      }
    });
  }

  try {
    targetWin.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch {
    // ignore in restricted environments
  }
}

function isPureMetaMaskProvider(p: any): boolean {
  if (!p || !p.isMetaMask) return false;
  // Core, Rainbow, Coinbase/Base, Rabby, Brave, Phantom etc. often set isMetaMask=true for legacy compatibility.
  // Exclude them so clicking MetaMask only opens the genuine MetaMask extension.
  if (
    p.isAvalanche ||
    p.isRainbow ||
    p.isCoinbaseWallet ||
    p.isCoinbaseBrowser ||
    p.isRabby ||
    p.isBraveWallet ||
    p.isPhantom ||
    p.isTokenPocket ||
    p.isTrust ||
    p.isOkxWallet ||
    p.isOKExWallet
  ) {
    return false;
  }
  return true;
}

function isCoreProvider(p: any): boolean {
  return Boolean(p && (p.isAvalanche || p.isCoreWallet));
}

function isRainbowProvider(p: any): boolean {
  return Boolean(p && p.isRainbow);
}

function isBaseCoinbaseProvider(p: any): boolean {
  return Boolean(p && (p.isCoinbaseWallet || p.isCoinbaseBrowser));
}

/**
 * Resolves the specific EIP-1193 provider for a browser wallet without cross-extension collision.
 * Priority:
 *  1. EIP-6963 announced providers (exact RDNS match, then wallet name match)
 *  2. Dedicated window namespace (`window.avalanche`, `window.coinbaseWalletExtension`, `window.rainbow`)
 *  3. Multi-injected `window.ethereum.providers` array
 *  4. Top-level `window.ethereum`
 */
export function findWalletProvider(walletId: BrowserWalletId, win?: any): EIP1193Provider | undefined {
  const targetWin = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (targetWin) {
    initEip6963Discovery(targetWin);
  }

  const allAnnounced = getAnnouncedProviders();

  // 1. Check EIP-6963 announced providers
  if (walletId === 'core') {
    const byRdns = allAnnounced.find(
      (d) => d.info.rdns === 'app.core.extension' || d.info.rdns === 'com.avax.core'
    );
    if (byRdns) return byRdns.provider;
    const byName = allAnnounced.find(
      (d) => d.info.name?.toLowerCase().includes('core') || isCoreProvider(d.provider)
    );
    if (byName) return byName.provider;
  } else if (walletId === 'metaMask') {
    const byRdns = allAnnounced.find(
      (d) =>
        d.info.rdns === 'io.metamask' ||
        d.info.rdns === 'io.metamask.flask' ||
        d.info.rdns === 'io.metamask.mobile'
    );
    if (byRdns) return byRdns.provider;
    const byName = allAnnounced.find(
      (d) =>
        d.info.name?.toLowerCase().includes('metamask') &&
        !isCoreProvider(d.provider) &&
        !isRainbowProvider(d.provider) &&
        !isBaseCoinbaseProvider(d.provider)
    );
    if (byName) return byName.provider;
  } else if (walletId === 'rainbow') {
    const byRdns = allAnnounced.find((d) => d.info.rdns === 'me.rainbow');
    if (byRdns) return byRdns.provider;
    const byName = allAnnounced.find(
      (d) => d.info.name?.toLowerCase().includes('rainbow') || isRainbowProvider(d.provider)
    );
    if (byName) return byName.provider;
  } else if (walletId === 'base') {
    const byRdns = allAnnounced.find(
      (d) => d.info.rdns === 'com.coinbase.wallet' || d.info.rdns === 'com.base.wallet'
    );
    if (byRdns) return byRdns.provider;
    const byName = allAnnounced.find(
      (d) =>
        d.info.name?.toLowerCase().includes('coinbase') ||
        d.info.name?.toLowerCase() === 'base' ||
        d.info.name?.toLowerCase().includes('base wallet') ||
        isBaseCoinbaseProvider(d.provider)
    );
    if (byName) return byName.provider;
  }

  if (!targetWin) return undefined;

  const eth = targetWin.ethereum;
  const providersList: any[] = Array.isArray(eth?.providers) ? eth.providers : [];

  // 2. Check dedicated namespaces & providers array & window.ethereum
  if (walletId === 'core') {
    if (targetWin.avalanche && typeof targetWin.avalanche.request === 'function') {
      return targetWin.avalanche as EIP1193Provider;
    }
    const inArray = providersList.find(isCoreProvider);
    if (inArray) return inArray as EIP1193Provider;
    if (isCoreProvider(eth)) return eth as EIP1193Provider;
    return undefined;
  }

  if (walletId === 'metaMask') {
    const inArray = providersList.find(isPureMetaMaskProvider);
    if (inArray) return inArray as EIP1193Provider;
    // Also check if window.ethereum.providerMap exists (used by some Coinbase/multi-wallet shims)
    if (eth?.providerMap instanceof Map && eth.providerMap.has('MetaMask')) {
      const mapped = eth.providerMap.get('MetaMask');
      if (isPureMetaMaskProvider(mapped)) return mapped as EIP1193Provider;
    }
    if (isPureMetaMaskProvider(eth)) return eth as EIP1193Provider;
    return undefined;
  }

  if (walletId === 'rainbow') {
    if (targetWin.rainbow && typeof targetWin.rainbow.request === 'function') {
      return targetWin.rainbow as EIP1193Provider;
    }
    const inArray = providersList.find(isRainbowProvider);
    if (inArray) return inArray as EIP1193Provider;
    if (isRainbowProvider(eth)) return eth as EIP1193Provider;
    return undefined;
  }

  if (walletId === 'base') {
    if (
      targetWin.coinbaseWalletExtension &&
      typeof targetWin.coinbaseWalletExtension.request === 'function'
    ) {
      return targetWin.coinbaseWalletExtension as EIP1193Provider;
    }
    const inArray = providersList.find(isBaseCoinbaseProvider);
    if (inArray) return inArray as EIP1193Provider;
    if (isBaseCoinbaseProvider(eth)) return eth as EIP1193Provider;
    return undefined;
  }

  return undefined;
}

/**
 * Waits briefly for EIP-6963 announcements or delayed extension injection before concluding a wallet is absent.
 */
export async function resolveWalletProvider(
  walletId: BrowserWalletId,
  win?: any,
  timeoutMs = 150
): Promise<EIP1193Provider | undefined> {
  const immediate = findWalletProvider(walletId, win);
  if (immediate) return immediate;

  if (timeoutMs <= 0) return undefined;

  await new Promise((resolve) => setTimeout(resolve, timeoutMs));
  return findWalletProvider(walletId, win);
}

// Active account selection tracking per wallet (fixes Core & MetaMask multi-account selection)
const selectedAccountMap = new Map<string, Address>();
const knownAccountsMap = new Map<string, Address[]>();

function getStorageKey(walletId: string): string {
  return `escrow_selected_account_${walletId}`;
}

export function getSelectedWalletAccount(walletId: string): Address | undefined {
  const inMem = selectedAccountMap.get(walletId);
  if (inMem) return inMem;

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const saved = window.sessionStorage.getItem(getStorageKey(walletId));
      if (saved) {
        const checksummed = getAddress(saved);
        selectedAccountMap.set(walletId, checksummed);
        return checksummed;
      }
    } catch {
      // ignore invalid address or storage restriction
    }
  }
  return undefined;
}

export function setSelectedWalletAccount(walletId: string, address: string | undefined | null) {
  if (!address) {
    selectedAccountMap.delete(walletId);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.removeItem(getStorageKey(walletId));
      } catch {
        // ignore
      }
    }
    return;
  }

  try {
    const checksummed = getAddress(address);
    selectedAccountMap.set(walletId, checksummed);
    if (typeof window !== 'undefined' && window.sessionStorage) {
      try {
        window.sessionStorage.setItem(getStorageKey(walletId), checksummed);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore malformed address
  }
}

export function orderAccountsWithSelected(
  rawAccounts: readonly string[],
  selected?: string | null
): Address[] {
  const seen = new Set<string>();
  const normalized: Address[] = [];

  for (const acc of rawAccounts) {
    if (!acc || typeof acc !== 'string') continue;
    try {
      const checksummed = getAddress(acc);
      const lower = checksummed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        normalized.push(checksummed);
      }
    } catch {
      // skip invalid
    }
  }

  if (!selected) return normalized;

  try {
    const targetLower = getAddress(selected).toLowerCase();
    const idx = normalized.findIndex((a) => a.toLowerCase() === targetLower);
    if (idx > 0) {
      const [picked] = normalized.splice(idx, 1);
      normalized.unshift(picked);
    }
  } catch {
    // ignore
  }

  return normalized;
}

export function recordKnownWalletAccounts(walletId: string, accounts: readonly string[]): Address[] {
  const existing = knownAccountsMap.get(walletId) || [];
  const merged = orderAccountsWithSelected(
    [...accounts, ...existing],
    getSelectedWalletAccount(walletId)
  );
  knownAccountsMap.set(walletId, merged);
  return merged;
}

export function getKnownWalletAccounts(walletId: string): Address[] {
  return knownAccountsMap.get(walletId) || [];
}

/**
 * Extracts authorized account addresses from EIP-2255 `wallet_requestPermissions` response if present.
 */
function extractAccountsFromPermissions(permissions: any): string[] {
  if (!Array.isArray(permissions)) return [];
  const extracted: string[] = [];
  for (const perm of permissions) {
    if (perm?.parentCapability === 'eth_accounts' && Array.isArray(perm?.caveats)) {
      for (const caveat of perm.caveats) {
        if (Array.isArray(caveat?.value)) {
          for (const item of caveat.value) {
            if (typeof item === 'string') extracted.push(item);
          }
        }
      }
    }
  }
  return extracted;
}

/**
 * Creates a dedicated Wagmi connector for a specific browser wallet (Core, MetaMask, Rainbow, Base)
 * with runtime EIP-6963 discovery and multi-account switching support.
 */
export function createBrowserWalletConnector(meta: WalletOptionMeta, winOverride?: any) {
  const walletId = meta.id as BrowserWalletId;

  return createConnector<any>((config) => {
    let accountsChangedListener: ((accounts: string[]) => void) | undefined;
    let chainChangedListener: ((chainId: string) => void) | undefined;
    let disconnectListener: ((error?: Error) => void) | undefined;
    let boundProvider: any;

    function attachListeners(provider: any, connectorSelf: any) {
      if (!provider || typeof provider.on !== 'function') return;
      if (boundProvider === provider && accountsChangedListener) return;

      detachListeners();
      boundProvider = provider;

      accountsChangedListener = connectorSelf.onAccountsChanged.bind(connectorSelf);
      chainChangedListener = connectorSelf.onChainChanged.bind(connectorSelf);
      disconnectListener = connectorSelf.onDisconnect.bind(connectorSelf);

      provider.on('accountsChanged', accountsChangedListener);
      provider.on('chainChanged', chainChangedListener);
      provider.on('disconnect', disconnectListener);
    }

    function detachListeners() {
      if (!boundProvider || typeof boundProvider.removeListener !== 'function') return;
      if (accountsChangedListener) {
        boundProvider.removeListener('accountsChanged', accountsChangedListener);
      }
      if (chainChangedListener) {
        boundProvider.removeListener('chainChanged', chainChangedListener);
      }
      if (disconnectListener) {
        boundProvider.removeListener('disconnect', disconnectListener);
      }
      accountsChangedListener = undefined;
      chainChangedListener = undefined;
      disconnectListener = undefined;
      boundProvider = undefined;
    }

    return {
      id: walletId,
      name: meta.name,
      icon: meta.iconUrl,
      type: 'injected',

      async setup() {
        initEip6963Discovery(winOverride);
      },

      async connect({ chainId, isReconnecting } = {}) {
        const provider = await this.getProvider();
        if (!provider) {
          throw new ProviderNotFoundError();
        }

        let accounts: Address[] = [];
        if (isReconnecting) {
          accounts = [...(await this.getAccounts().catch(() => []))];
        }

        if (!accounts.length && !isReconnecting) {
          try {
            const requested = (await provider.request({
              method: 'eth_requestAccounts',
            })) as string[];

            // Also query eth_accounts in case the wallet holds multiple authorized accounts
            const allPermitted = (await provider
              .request({ method: 'eth_accounts' })
              .catch(() => [])) as string[];

            const combined = [...(requested || []), ...(allPermitted || [])];
            const currentSelected = getSelectedWalletAccount(walletId) || requested?.[0];
            if (currentSelected) {
              setSelectedWalletAccount(walletId, currentSelected);
            }
            accounts = orderAccountsWithSelected(combined, currentSelected);
            knownAccountsMap.set(walletId, accounts);
          } catch (err: any) {
            if (err?.code === 4001 || err?.message?.toLowerCase()?.includes('rejected')) {
              throw new UserRejectedRequestError(err);
            }
            throw err;
          }
        }

        attachListeners(provider, this);

        let currentChainId = await this.getChainId();
        if (chainId && currentChainId !== chainId && !isReconnecting) {
          const chain = await this.switchChain!({ chainId }).catch((error) => {
            if (error.code === UserRejectedRequestError.code) throw error;
            return { id: currentChainId };
          });
          currentChainId = chain?.id ?? currentChainId;
        }

        return {
          accounts: accounts as any,
          chainId: currentChainId,
        };
      },

      async disconnect() {
        detachListeners();
        setSelectedWalletAccount(walletId, null);
        knownAccountsMap.delete(walletId);
      },

      async getAccounts() {
        const provider = await this.getProvider();
        if (!provider) throw new ProviderNotFoundError();
        const rawAccounts = (await provider.request({
          method: 'eth_accounts',
        })) as string[];
        const selected = getSelectedWalletAccount(walletId) || rawAccounts?.[0];
        const ordered = orderAccountsWithSelected(rawAccounts || [], selected);
        if (ordered.length > 0) {
          knownAccountsMap.set(walletId, ordered);
        }
        return ordered;
      },

      async getChainId() {
        const provider = await this.getProvider();
        if (!provider) throw new ProviderNotFoundError();
        const hexChainId = (await provider.request({
          method: 'eth_chainId',
        })) as string;
        return Number(hexChainId);
      },

      async getProvider() {
        return (await resolveWalletProvider(walletId, winOverride, 50)) as EIP1193Provider;
      },

      async isAuthorized() {
        try {
          const provider = await resolveWalletProvider(walletId, winOverride, 50);
          if (!provider) return false;
          const accounts = await withRetry(() => this.getAccounts());
          return accounts.length > 0;
        } catch {
          return false;
        }
      },

      async switchChain({ addEthereumChainParameter, chainId }) {
        const provider = await this.getProvider();
        if (!provider) throw new ProviderNotFoundError();

        const chain = config.chains.find((x) => x.id === chainId);
        if (!chain) throw new SwitchChainError(new Error(`Chain ${chainId} not configured`));

        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: numberToHex(chainId) }],
          });
          return chain;
        } catch (err: any) {
          if (err?.code === 4902 || err?.data?.originalError?.code === 4902) {
            try {
              const blockExplorerUrls = addEthereumChainParameter?.blockExplorerUrls
                ? addEthereumChainParameter.blockExplorerUrls
                : chain.blockExplorers?.default?.url
                  ? [chain.blockExplorers.default.url]
                  : [];
              const rpcUrls = addEthereumChainParameter?.rpcUrls?.length
                ? addEthereumChainParameter.rpcUrls
                : [chain.rpcUrls.default?.http?.[0] ?? ''];

              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: numberToHex(chainId),
                    chainName: addEthereumChainParameter?.chainName ?? chain.name,
                    nativeCurrency: addEthereumChainParameter?.nativeCurrency ?? chain.nativeCurrency,
                    rpcUrls,
                    blockExplorerUrls,
                  },
                ],
              });
              return chain;
            } catch (addError: any) {
              if (addError?.code === 4001) {
                throw new UserRejectedRequestError(addError);
              }
              throw new SwitchChainError(addError);
            }
          }
          if (err?.code === 4001) {
            throw new UserRejectedRequestError(err);
          }
          throw new SwitchChainError(err);
        }
      },

      onAccountsChanged(accounts: string[]) {
        if (!accounts || accounts.length === 0) {
          this.onDisconnect();
        } else {
          // When the extension fires accountsChanged, accounts[0] is the newly selected account in the wallet
          const primary = accounts[0];
          setSelectedWalletAccount(walletId, primary);
          const ordered = recordKnownWalletAccounts(walletId, accounts);
          config.emitter.emit('change', {
            accounts: ordered,
          });
        }
      },

      onChainChanged(chain: string) {
        const chainId = Number(chain);
        config.emitter.emit('change', { chainId });
      },

      async onDisconnect(_error?: Error) {
        const provider = await this.getProvider().catch(() => undefined);
        if (provider) {
          // Verify whether accounts are actually empty before disconnecting (some wallets emit disconnect on chain switch)
          const accounts = await this.getAccounts().catch(() => []);
          if (accounts.length > 0) return;
        }
        detachListeners();
        config.emitter.emit('disconnect');
      },
    };
  });
}

/**
 * Switches the active accountamong the authorized accounts for the connected browser wallet,
 * placing `targetAddress` at index 0 so Wagmi's `useAccount().address` updates immediately.
 */
export async function selectWalletAccount(
  connector: any,
  targetAddress: string
): Promise<Address[]> {
  const walletId = connector?.id || 'injected';
  const checksummed = getAddress(targetAddress);
  setSelectedWalletAccount(walletId, checksummed);

  let rawAccounts: string[] = [];
  try {
    const provider = await connector?.getProvider?.();
    if (provider && typeof provider.request === 'function') {
      rawAccounts = ((await provider.request({ method: 'eth_accounts' })) as string[]) || [];
    }
  } catch {
    // ignore
  }

  const known = getKnownWalletAccounts(walletId);
  const merged = orderAccountsWithSelected(
    [checksummed, ...rawAccounts, ...known],
    checksummed
  );
  knownAccountsMap.set(walletId, merged);

  if (typeof connector?.onAccountsChanged === 'function') {
    connector.onAccountsChanged(merged);
  }

  return merged;
}

/**
 * Prompts the browser wallet extension to let the user pick or grant access to another account
 * (e.g. Account 2 in Core or MetaMask), then updates the active account.
 */
export async function requestWalletAccountSelection(
  connector: any,
  currentAddress?: string
): Promise<{ accounts: Address[]; activeAddress?: Address }> {
  const walletId = connector?.id || 'injected';
  const provider = await connector?.getProvider?.();
  if (!provider || typeof provider.request !== 'function') {
    throw new ProviderNotFoundError();
  }

  let permissionAccounts: string[] = [];

  // 1. Try EIP-2255 wallet_requestPermissions to open the wallet's account picker popup
  try {
    const permissions = await provider.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
    permissionAccounts = extractAccountsFromPermissions(permissions);
  } catch (err: any) {
    // If user explicitly rejected the permission prompt, rethrow
    if (err?.code === 4001 || err?.message?.toLowerCase()?.includes('rejected')) {
      throw new UserRejectedRequestError(err);
    }
    // Otherwise (e.g. Core Wallet returning -32601 Method not found), fall back to eth_requestAccounts
  }

  // 2. Query eth_requestAccounts and eth_accounts to get all authorized accounts
  const requested = ((await provider
    .request({ method: 'eth_requestAccounts' })
    .catch(() => [])) as string[]) || [];
  const ethAccounts = ((await provider
    .request({ method: 'eth_accounts' })
    .catch(() => [])) as string[]) || [];

  const allRaw = [...permissionAccounts, ...requested, ...ethAccounts];
  const uniqueAccounts = orderAccountsWithSelected(allRaw, null);

  if (uniqueAccounts.length === 0) {
    return { accounts: [] };
  }

  // Determine which account to activate:
  // - If permissionAccounts has a specific account different from currentAddress, pick it.
  // - Else if uniqueAccounts has another account besides currentAddress and only 2+ accounts exist,
  //   pick the newly added account or next account if the wallet didn't reorder eth_accounts (Core Wallet behavior!).
  let nextSelected: Address = uniqueAccounts[0];
  if (currentAddress) {
    const currentLower = currentAddress.toLowerCase();
    const diffInPerm = permissionAccounts.find((a) => a.toLowerCase() !== currentLower);
    if (diffInPerm) {
      nextSelected = getAddress(diffInPerm);
    } else if (
      uniqueAccounts.length > 1 &&
      uniqueAccounts[0].toLowerCase() === currentLower
    ) {
      // In Core Wallet, eth_accounts always returns [Account 1, Account 2] in creation order.
      // Selecting the next account allows immediate switching to Account 2.
      nextSelected = uniqueAccounts[1];
    }
  }

  setSelectedWalletAccount(walletId, nextSelected);
  const ordered = orderAccountsWithSelected(uniqueAccounts, nextSelected);
  knownAccountsMap.set(walletId, ordered);

  if (typeof connector?.onAccountsChanged === 'function') {
    connector.onAccountsChanged(ordered);
  }

  return {
    accounts: ordered,
    activeAddress: ordered[0],
  };
}
