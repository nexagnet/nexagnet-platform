# Bàn giao — Vận hành vận tải

**Bắt đầu từ đây:** [**Giới thiệu hệ thống cho lãnh đạo**](gioi-thieu-he-thong-cho-lanh-dao.md), cũng có [bản PDF](gioi-thieu-he-thong-cho-lanh-dao.pdf).

Tài liệu này mô tả luồng hiện hành, theo thứ tự:

1. **Đơn hàng**, với điểm lấy và điểm giao chọn trên bản đồ;
2. **Vòng xe**;
3. **Chặng rỗng** và **chặng có hàng**;
4. **Mốc hiện trường** của lái xe;
5. **Kết thúc đơn**;
6. **Đối soát**, **phải thu**, **thu tiền**.

Tài liệu cũng nói hai đường tiền của nhiên liệu, biên trực tiếp, và những hạn chế hiện tại. Đọc trong khoảng 15 phút.

| File                                                                                                                       | Dành cho                           | Nội dung                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`gioi-thieu-he-thong-cho-lanh-dao.md`](gioi-thieu-he-thong-cho-lanh-dao.md) · [PDF](gioi-thieu-he-thong-cho-lanh-dao.pdf) | **Lãnh đạo** — tài liệu chính      | Hệ thống giải quyết việc gì, một đơn đi qua công ty, từ cần biết, ai làm gì, 10 màn hình có khoanh, nhiên liệu và quỹ lái xe, hạn chế, việc cần lãnh đạo quyết                           |
| [`huong-dan-ke-toan.md`](huong-dan-ke-toan.md) · [PDF](huong-dan-ke-toan.pdf)                                              | **Kế toán**                        | Việc hằng ngày theo thứ tự: kết thúc đơn, đối soát và thu tiền, phải trả, nhiên liệu và đối soát bảng kê, quỹ lái xe, lương, hiệu quả từng đơn, tình huống thường gặp — 12 ảnh có khoanh |
| [`huong-dan-tai-xe.md`](huong-dan-tai-xe.md) · [PDF](huong-dan-tai-xe.pdf)                                                 | **Lái xe** — đọc trên điện thoại   | Bấm đâu, thấy gì, làm gì tiếp: trang chủ, hiện trường, chờ người nhận, biên nhận, nhiên liệu, quỹ, phiếu lương, khi mất sóng — 14 ảnh điện thoại                                         |
| [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md)                                                               | Người triển khai                   | Danh sách kiểm thay dữ liệu mẫu bằng dữ liệu thật, sáu mẫu thu thập, và những gì cần khách chốt                                                                                          |
| [`bat-dau-nhanh.md`](bat-dau-nhanh.md)                                                                                     | _(cũ)_ Giám đốc · Kế toán · Lái xe | Viết theo cách làm dựa trên **chuyến**, trước khi có đơn hàng và vòng xe. Nhiều tên menu đã đổi                                                                                          |
| [`kich-ban-demo.md`](kich-ban-demo.md)                                                                                     | _(cũ)_ Người trình bày             | Kịch bản đo ngày 06/09/2026 theo chuyến. Số liệu kỳ vọng không còn khớp                                                                                                                  |
| [`van-hanh-ban-demo.md`](van-hanh-ban-demo.md)                                                                             | _(cũ)_ Người vận hành              | Sao lưu và phục hồi cho stack máy ảo cũ. **Không chạy mục làm lại dữ liệu** trên bản demo hiện tại                                                                                       |
| [`nguon-html/`](nguon-html/README.md)                                                                                      | Người bảo trì tài liệu             | Cách tái sinh PDF từ Markdown                                                                                                                                                            |
| [`cong-cu-anh/`](cong-cu-anh/README.md)                                                                                    | Người bảo trì tài liệu             | Kịch bản chụp lại ảnh kế toán và lái xe trên bản cục bộ                                                                                                                                  |

> **Trạng thái:** bản demo chạy trên dữ liệu mẫu. Khách chưa nghiệm thu trên nghiệp vụ thật của
> mình. Chỉ nghiệm thu của khách mới biến nó thành hệ thống đã được chứng minh cho doanh nghiệp.

## Bảng phân quyền

Có bốn vai trên nền tảng. Bảng dưới đối chiếu với mã nguồn ngày 24/09/2026. **Máy chủ cưỡng chế lại lần nữa**, nên ẩn một nút trên màn hình không phải là cách cấp quyền.

Từ đợt quản trị tài khoản (25/09/2026), bảng này là **vai khởi điểm** của mỗi người. Giám đốc bật thêm hoặc tắt bớt từng nhóm việc cho người Điều hành và Kế toán, xem mục [Giám đốc quản trị tài khoản, quyền và địa điểm vận hành](#giám-đốc-quản-trị-tài-khoản-quyền-và-địa-điểm-vận-hành) ngay dưới.

|                                                                                                                    | Giám đốc | Kế toán | Lái xe | Quản lý |
| ------------------------------------------------------------------------------------------------------------------ | -------- | ------- | ------ | ------- |
| Xem toàn bộ màn hình vận hành                                                                                      | ✅       | ✅      | ❌     | ❌      |
| Tạo đơn trên bản đồ, lập kế hoạch và giao xe, tiến chặng, xác nhận giao xong                                       | ✅       | ✅      | —      | ❌      |
| Kết thúc đơn, đối soát với khách, ghi và phân bổ tiền về                                                           | ✅       | ✅      | ❌     | ❌      |
| Hồ sơ xe · lái xe · khách hàng · đối tác                                                                           | ✅       | ✅      | ❌     | ❌      |
| Quỹ lái xe: tạm ứng, hoàn quỹ, điều chỉnh, bút toán đảo                                                            | ✅       | ✅      | ❌     | ❌      |
| Nhiên liệu: xác thực phiếu, nhập bảng kê, so khớp, xử lý chênh lệch, chốt kỳ                                       | ✅       | ✅      | ❌     | ❌      |
| Báo cáo công nợ, biên trực tiếp, chuỗi chứng từ                                                                    | ✅       | ✅      | ❌     | ❌      |
| Bảo dưỡng · giấy tờ · cảnh báo                                                                                     | ✅       | ✅      | ❌     | ❌      |
| Lương: mở kỳ, chạy lương, duyệt, chi, phát phiếu bù/đảo                                                            | ✅       | ✅      | ❌     | ❌      |
| **Mở lại kỳ chi phí / quỹ đã chốt**                                                                                | ✅       | ❌      | ❌     | ❌      |
| **Mở lại kỳ đối soát nhiên liệu**                                                                                  | ✅       | ❌      | ❌     | ❌      |
| **Xem lịch sử vị trí** của lái xe                                                                                  | ✅       | ❌      | ❌     | ❌      |
| **Huỷ chuyến** (chuyến theo cách cũ)                                                                               | ✅       | ❌      | ❌     | ❌      |
| Việc được giao **cho chính mình**: xem, bấm mốc hiện trường, chụp giấy tờ                                          | —        | —       | ✅     | ❌      |
| Phiếu nhiên liệu **của chính mình**, chọn tự trả tiền mặt hay ghi nợ cây xăng                                      | —        | —       | ✅     | ❌      |
| Khoản chi dọc đường **của chính mình**. Hiện chỉ ghi được trên chuyến theo cách cũ, **chưa ghi được trên vòng xe** | —        | —       | ✅     | ❌      |
| Số dư quỹ và phiếu lương **của chính mình**, chỉ phiếu đã công bố                                                  | —        | —       | ✅     | ❌      |

**Kế toán bị máy chủ từ chối mười hai việc** mà giám đốc làm được:

- huỷ chuyến;
- mở lại kỳ chi phí;
- mở lại kỳ đối soát nhiên liệu;
- đảo một lần chi quyết toán cho lái xe;
- xem lịch sử vị trí;
- ghi mốc hiện trường;
- đóng phiên chờ;
- ghi bù giấy tờ vận hành thay lái xe;
- rút giấy tờ vận hành;
- rút bằng chứng;
- nhập vị trí từ thiết bị trên xe;
- quản lý địa điểm vận hành (bãi xe, kho, nhà máy).

Nhiều việc trong số này hiện chưa có nút trên màn hình cho cả hai vai. Kế toán **được** tạo đơn và điều xe: phía điều xe gần như chưa tách vai.

**Vai Quản lý (trên màn hình: _Điều hành / Quản lý_) bắt đầu trống.** Tài liệu nghiệp vụ của khách chỉ mô tả ba mẫu vai, nên vai này không có quyền vận tải nào cho tới khi Giám đốc chọn nhóm việc cho từng người. Người đăng nhập bằng vai này mà chưa được cấp nhóm nào nhận được một câu nói thẳng điều đó, kèm chỉ dẫn liên hệ quản trị viên.

## Giám đốc quản trị tài khoản, quyền và địa điểm vận hành

> **Trạng thái:** mã nguồn đã xong, **chưa triển khai lên bản demo**, chưa có bằng chứng chạy thật.

Nhóm **QUẢN TRỊ** ở cuối thanh điều hướng có hai màn: **Tài khoản & quyền** (chỉ Giám đốc thấy) và **Địa điểm vận hành**.

### Tài khoản & quyền

Tạo tài khoản bắt đầu bằng câu hỏi **"Người này là ai?"**:

| Chọn                     | Làm được gì                                                                  | Chỉnh thêm được không                                                             |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Giám đốc**             | Toàn quyền vận hành, duyệt tiền và quản trị tài khoản                        | Không cần. Cấp vai này phải gõ lại câu xác nhận "Tôi hiểu Giám đốc có toàn quyền" |
| **Điều hành / Quản lý**  | Bắt đầu trống                                                                | Giám đốc bật từng nhóm việc cần dùng                                              |
| **Kế toán**              | Như cột Kế toán ở bảng trên                                                  | Bật thêm hoặc tắt bớt từng việc                                                   |
| **Lái xe**               | Chỉ việc của chính mình, **sau khi** tài khoản được nối với một hồ sơ lái xe | Không. Phạm vi của lái xe đến từ hồ sơ lái xe, không từ ô đánh dấu                |
| **Chủ xe / bên góp vốn** | Chỉ xem các xe mình có cổ phần, sau khi nối với hồ sơ bên góp vốn            | Không. Đây là vai Điều hành không nhóm việc nào, cộng với hồ sơ bên góp vốn       |

Có 11 nhóm việc để chọn: điều hành đơn, vòng xe, chặng · hiện trường và bằng chứng · đội xe và lái xe · khách hàng, đối tác · kế toán và công nợ · nhiên liệu · quỹ lái xe, lương · bảo dưỡng, giấy tờ · bản đồ, vị trí và địa điểm · phí đường bộ (ETC) · báo cáo. Nhóm thứ 12, quản trị, chỉ Giám đốc có. Mỗi lần bật tắt, màn hình hiện lại câu **"Người này làm được gì?"** do máy chủ viết, trước khi lưu.

Một số nhóm cần **xem** dữ liệu của nhóm khác thì màn hình mới dùng được — ví dụ lịch bảo dưỡng cần danh sách xe để hiện biển số, quỹ lái xe cần hồ sơ lái xe để chọn người. Bật nhóm đó thì màn hình **bật kèm** các quyền xem này và ghi rõ **"Kèm theo để dùng được …"**; Giám đốc vẫn tắt được từng dòng. Khi bộ quyền đang chọn vi phạm quy tắc (ví dụ tách nhiệm bên dưới), nút **Lưu quyền** tạm khoá và nói lý do cho tới khi sửa xong.

Ba điều máy chủ không cho, dù Giám đốc bấm gì:

- **Việc chỉ Giám đốc làm** không cấp được cho ai: mở lại kỳ chi phí, mở lại kỳ đối soát nhiên liệu, đảo một lần chi quyết toán, nối tài khoản với hồ sơ lái xe hay bên góp vốn, và quản trị tài khoản.
- **Người duyệt tiền không sửa được căn cứ của khoản tiền đó.** Một người không thể vừa duyệt nghiệm thu, duyệt phụ cấp chờ hay xác nhận đối soát, vừa ghi mốc hiện trường, đóng phiên chờ, ghi hay rút giấy tờ, rút bằng chứng, nhập vị trí thiết bị, hay sửa địa điểm vận hành.
- **Việc nhạy cảm phải xác nhận.** Chín việc Kế toán mặc định không làm (danh sách trên, trừ ba việc chỉ Giám đốc) vẫn cấp riêng được, nhưng Giám đốc phải xác nhận, và lần cấp được ghi riêng vào lịch sử.

Những điều cần biết khi vận hành:

- Đổi quyền **có hiệu lực ngay lần bấm kế tiếp** của người đó, không cần đăng nhập lại. **Khoá tài khoản** hoặc **đặt lại mật khẩu** thì người đó bị đăng xuất ngay.
- Tài khoản mới, hoặc vừa được đặt lại mật khẩu, nhận một **mật khẩu tạm** 16 ký tự, hạn 72 giờ, hiện **một lần** trên màn hình để Giám đốc chuyển cho người đó. Lần đăng nhập đầu phải đổi mật khẩu rồi mới làm được việc khác. Quá hạn thì nhờ Giám đốc cấp mật khẩu mới.
- **Không xoá tài khoản**, chỉ **Khoá** / **Mở khoá**. Mở khoá không đổi mật khẩu. Giám đốc không tự khoá hay tự đổi quyền của chính mình, và không khoá hay hạ vai được Giám đốc đang hoạt động cuối cùng.
- **Nối hồ sơ lái xe:** chỉ tài khoản vai Lái xe; mỗi tài khoản một hồ sơ. Tài khoản đang nối hồ sơ lái xe không đổi được sang vai văn phòng. Muốn đổi thì gỡ nối trước.
- Mỗi thay đổi ghi vào **Lịch sử thay đổi** của tài khoản: ai làm, lúc nào, trước và sau.

### Địa điểm vận hành

Một danh sách duy nhất trên bản đồ cho **bãi xe**, **kho của khách hàng**, **nhà máy, kho của đối tác**. Đây cũng chính là danh sách _Địa điểm đã biết_ khi tạo đơn. Trước đây danh sách này do đội triển khai nhập, chưa có màn hình.

- Thêm địa điểm bắt đầu bằng câu hỏi **"Địa điểm này của ai?"**: bãi xe của công ty mình · kho, cửa hàng của một khách hàng · nhà máy, kho của đơn vị khác. Đặt điểm bằng cách bấm trên bản đồ, kéo ghim, dùng vị trí hiện tại, hoặc dán toạ độ hay liên kết Google Maps; chọn bán kính.
- **Tên không được trùng** với một địa điểm đang dùng, so không phân biệt dấu và hoa thường, để khi điều xe không nhầm hai nơi.
- **Không xoá, chỉ tắt và bật.** Tắt một kho của đơn vị khác là tắt cả kho đó.
- **Bãi xe:** chỉ **một** bãi đang dùng. Đó là nơi mọi vòng xe mới xuất phát (chặng rỗng) và nơi vòng xe tự đóng khi xe về. Thêm bãi khi đã có bãi đang dùng thì bãi mới là bãi dự phòng; **"Đặt làm bãi chính"** đổi trong một bước. Đổi tên hay tắt bãi đang dùng khi còn vòng xe, đơn đang mở: hệ thống liệt kê chúng và hỏi xác nhận trước.
- **Sửa vị trí, bán kính, hay tắt một địa điểm** làm các bằng chứng hiện trường tại điểm đó được chấm lại theo vị trí mới, kể cả những lần giao đã xong. Vì vậy Kế toán mặc định không có việc này.
- Thêm, đổi tên, tắt hoặc bật kho, nhà máy của đơn vị khác cần thêm quyền quản lý khách hàng, đối tác.

## Cách ly dữ liệu lái xe: điều đáng nói với khách

Lái xe **không nhìn thấy giá cước, doanh thu, biên, hay công nợ của khách**, và điều đó không phải do ẩn trên màn hình. Máy chủ dựng riêng một khung nhìn cho lái xe; các trường tiền không nằm trong dữ liệu gửi xuống điện thoại. Lái xe chỉ thấy:

- việc được giao;
- quỹ của mình;
- phiếu dầu của mình;
- phiếu lương của mình.

Đã đo trên bản chạy, với khung nhìn chuyến theo cách cũ:

- khung nhìn có **0 trường mang hình dạng tiền**;
- giá cước đặt lúc lập chuyến **không xuất hiện** trong dữ liệu chuyến của chính lái xe đó;
- mở chuyến của người khác trả `403`, với thân phản hồi **giống hệt từng byte** phản hồi cho một chuyến không tồn tại, nên không thể dò xem chuyến nào có thật.

Thẻ việc theo vòng xe trên màn lái xe cũng không có ô tiền nào.

## Những việc hệ thống này KHÔNG làm

Nói trước, để không ai phải phát hiện giữa buổi demo:

| Không có                                            | Ghi chú                                                                                                                                                                                                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Giám sát hành trình liên tục / thiết bị trên xe** | Điểm lấy và điểm giao của đơn được chọn trên bản đồ. Vị trí điện thoại lái xe chỉ được lấy lúc bấm "Đã đến nơi" và "Khách đã nhận hàng". Tiến độ chặng do văn phòng bấm. Chưa nối thiết bị giám sát hành trình trên xe                                         |
| **Kế toán theo chuẩn mực / sổ sách thuế**           | Hệ thống tính công nợ và biên trực tiếp để phục vụ điều hành. Nó không thay phần mềm kế toán                                                                                                                                                                   |
| **Hoá đơn điện tử**                                 | Không phát hành, không ký số, không nối cơ quan thuế                                                                                                                                                                                                           |
| **Chế độ ngoại tuyến cho lái xe**                   | Màn hình lái xe cần mạng. Mất sóng giữa đường thì bấm lại khi có sóng; bấm lại không tạo mốc trùng                                                                                                                                                             |
| **Phân bổ chi phí cố định**                         | Biên hiển thị là **biên trực tiếp — chưa gồm chi phí cố định**, và nhãn đó có mặt ở mọi nơi hiển thị biên. Khấu hao, lương văn phòng, lãi vay không được phân bổ vào đơn hay vòng xe. Dòng chưa đủ số được đánh dấu "Chưa ghi chi phí" hoặc "Dầu chưa phân bổ" |
| **Trừ lương tự động khi lệch nhiên liệu**           | Bảng kê lệch hoặc mập mờ **không bao giờ** tự sinh nợ cho lái xe hay khoản trừ lương. Một người phải quyết định điều đó                                                                                                                                        |
| **Nối ERP / phần mềm bán hàng**                     | Chưa có. Cổng kết nối tồn tại trong kiến trúc nhưng không được gọi ở giai đoạn này                                                                                                                                                                             |
| **Nhập hàng loạt danh mục nền**                     | Xe, lái xe, khách hàng, đối tác nhập bằng biểu mẫu trên màn hình. Chỉ **bảng kê cây xăng** có đường nhập tệp trong sản phẩm. Xem [`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md)                                                                  |

Hai mục cuối là **quyết định hoặc giới hạn hiện tại**, không phải điều bất biến. Nếu khách cần, chúng nằm trong danh sách cần chốt ở tài liệu chuyển dữ liệu. Các hạn chế khác của luồng hiện hành được liệt kê ở mục 9 của [tài liệu cho lãnh đạo](gioi-thieu-he-thong-cho-lanh-dao.md#9-hạn-chế-hiện-tại).
